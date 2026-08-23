// The crash reporter's logic lives entirely in the pure module (the dialog is a thin renderer), so the
// dedupe, redaction and report assembly are all testable without a DOM.
import { test, expect, describe, beforeEach } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CrashBoundary, CrashOverlay } from "../../src/ide/CrashDialog";
import { color } from "../../src/landing/tokens";
import {
  _resetCrash,
  buildReportText,
  describeError,
  dismissCrash,
  installCrashHandlers,
  redactUrl,
  registerDiagnostic,
  reportCrash,
  scrub,
  sensitiveKeys,
  subscribeCrash,
  type CrashReport,
} from "../../src/ide/crash";

const seen = (): CrashReport | null => {
  let out: CrashReport | null = null;
  subscribeCrash((r) => {
    out = r;
  })();
  return out;
};

beforeEach(() => _resetCrash());

describe("dedupe & coalescing", () => {
  test("the same message twice is one report with a count", () => {
    reportCrash(new Error("boom"));
    reportCrash(new Error("boom"));
    expect(seen()?.count).toBe(2);
  });

  test("a distinct message lands in alsoSeen, never a second dialog", () => {
    reportCrash(new Error("first"));
    reportCrash(new Error("second"));
    const r = seen();
    expect(r?.detail.message).toBe("first");
    expect(r?.alsoSeen).toEqual(["second"]);
  });

  test("alsoSeen caps at 5 and never repeats a message", () => {
    reportCrash(new Error("head"));
    for (let i = 0; i < 9; i++) {
      reportCrash(new Error(`extra-${i}`));
    }
    reportCrash(new Error("extra-0"));
    expect(seen()?.alsoSeen).toHaveLength(5);
    expect(new Set(seen()?.alsoSeen).size).toBe(5);
  });

  test("dismiss mutes the message so a per-frame error can't re-open the dialog", () => {
    reportCrash(new Error("loop"));
    dismissCrash();
    expect(seen()).toBeNull();
    reportCrash(new Error("loop"));
    expect(seen()).toBeNull();
  });

  test("a different message after dismiss still opens", () => {
    reportCrash(new Error("one"));
    dismissCrash();
    reportCrash(new Error("two"));
    expect(seen()?.detail.message).toBe("two");
  });

  test("stops after 3 distinct dialogs in a session", () => {
    for (const m of ["a", "b", "c"]) {
      reportCrash(new Error(m));
      dismissCrash();
    }
    reportCrash(new Error("d"));
    expect(seen()).toBeNull();
  });

  test("subscribers get current state, and unsubscribe stops delivery", () => {
    const got: (CrashReport | null)[] = [];
    const off = subscribeCrash((r) => got.push(r));
    expect(got).toHaveLength(1); // initial
    reportCrash(new Error("x"));
    expect(got).toHaveLength(2);
    off();
    reportCrash(new Error("y"));
    expect(got).toHaveLength(2);
  });
});

describe("describeError", () => {
  test("an Error keeps name, message and a bounded stack", () => {
    const d = describeError(new Error("boom"));
    expect(d.name).toBe("Error");
    expect(d.message).toBe("boom");
    expect(d.stack!.split("\n").length).toBeLessThanOrEqual(24);
  });

  test("subclass name survives", () => {
    expect(describeError(new TypeError("nope")).name).toBe("TypeError");
  });

  test("non-Error throwables", () => {
    expect(describeError("plain").message).toBe("plain");
    expect(describeError("").message).toBe("(empty string)");
    expect(describeError(undefined).message).toBe("rejected with undefined");
    expect(describeError(null).message).toBe("rejected with null");
    expect(describeError(42).message).toBe("42");
  });

  test("a cross-realm error is duck-typed as an Error", () => {
    const d = describeError({ name: "RangeError", message: "out of range" });
    expect(d.name).toBe("RangeError");
    expect(d.message).toBe("out of range");
  });

  test("a circular object does not throw", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(() => describeError(o)).not.toThrow();
  });

  test("a throwing getter does not throw", () => {
    const o = {
      get boom(): string {
        throw new Error("getter");
      },
    };
    expect(() => describeError(o)).not.toThrow();
  });

  test("a long message is clipped", () => {
    const d = describeError(new Error("x".repeat(900)));
    expect(d.message.length).toBeLessThan(600);
    expect(d.message).toContain("chars)");
  });
});

describe("redaction", () => {
  test("a share link is collapsed — the linkId IS the credential", () => {
    expect(redactUrl("https://h/ide/s/AbC-123_xy9")).toBe("https://h/ide/:id/:id");
  });

  test("the OAuth fragment never survives", () => {
    const out = redactUrl("https://h/ide#token=eyJhbGciOiJIUzI1NiJ9.abc.def");
    expect(out).not.toContain("token");
    expect(out).not.toContain("eyJ");
  });

  test("query strings are dropped", () => {
    expect(redactUrl("https://h/docs?q=1")).toBe("https://h/docs");
  });

  test("a stack frame stays readable", () => {
    expect(redactUrl("https://h/assets/index-a1b2.js:412:19")).toBe("https://h/assets/index-a1b2.js:412:19");
  });

  test("a non-url is not echoed back", () => {
    expect(redactUrl("not a url")).toBe("<url>");
  });

  test("scrub catches a share link buried in a message", () => {
    expect(scrub("failed at https://h/ide/s/AbC-123_xy9 oops")).toContain("/ide/:id/:id");
  });

  test("scrub replaces a JWT wherever it appears", () => {
    expect(scrub("auth eyJhbGciOiJIUzI1NiJ9.payload.sig end")).toBe("auth <jwt> end");
  });
});

describe("registry", () => {
  test("a provider appears in the report; a null provider is omitted", () => {
    registerDiagnostic("shown", () => "here");
    registerDiagnostic("hidden", () => null);
    reportCrash(new Error("x"));
    const text = buildReportText(false);
    expect(text).toContain("[shown]");
    expect(text).not.toContain("[hidden]");
  });

  test("re-registering a key replaces it, and a stale unregister is a no-op", () => {
    const offFirst = registerDiagnostic("k", () => "first");
    registerDiagnostic("k", () => "second");
    offFirst(); // stale — must not delete the replacement
    reportCrash(new Error("x"));
    expect(buildReportText(false)).toContain("second");
  });

  test("unregister removes the section", () => {
    const off = registerDiagnostic("gone", () => "value");
    off();
    reportCrash(new Error("x"));
    expect(buildReportText(false)).not.toContain("[gone]");
  });

  test("a throwing provider degrades to one line and does not break the report", () => {
    registerDiagnostic("bad", () => {
      throw new Error("nope");
    });
    registerDiagnostic("good", () => "fine");
    reportCrash(new Error("x"));
    const text = buildReportText(false);
    expect(text).toContain("provider failed: nope");
    expect(text).toContain("fine");
  });

  test("sensitiveKeys drives the checkbox", () => {
    expect(sensitiveKeys()).toEqual([]);
    registerDiagnostic("plain", () => "a");
    registerDiagnostic("source", () => "b", { sensitive: true });
    expect(sensitiveKeys()).toEqual(["source"]);
  });
});

describe("buildReportText", () => {
  test("a sensitive section appears only when opted in", () => {
    registerDiagnostic("source", () => "MY CONTRACT", { sensitive: true });
    reportCrash(new Error("x"));
    expect(buildReportText(false)).not.toContain("MY CONTRACT");
    expect(buildReportText(true)).toContain("MY CONTRACT");
  });

  test("the header carries the fixed fields and the error", () => {
    reportCrash(new Error("kaboom"), "unhandledrejection");
    const text = buildReportText(false);
    expect(text).toContain("Qinit crash report");
    expect(text).toContain("source   unhandledrejection");
    expect(text).toContain("Error: kaboom");
  });

  test("the count is live, past the emit throttle", () => {
    for (let i = 0; i < 12; i++) {
      reportCrash(new Error("repeat"));
    }
    expect(buildReportText(false)).toContain("seen     12x");
  });

  test("empty sections are omitted", () => {
    reportCrash("a bare string");
    const text = buildReportText(false);
    expect(text).not.toContain("[also seen]");
    expect(text).not.toContain("[component stack]");
    expect(text).not.toContain("[stack]");
  });

  test("with no report it says so rather than throwing", () => {
    expect(buildReportText(false)).toContain("(no error)");
  });
});

describe("robustness", () => {
  test("reportCrash never throws, whatever it is handed", () => {
    const nasty = {
      get name(): string {
        throw new Error("boom");
      },
    };
    expect(() => reportCrash(nasty)).not.toThrow();
    expect(() => reportCrash(Symbol("s"))).not.toThrow();
  });

  test("installCrashHandlers is safe to call twice", () => {
    expect(() => {
      installCrashHandlers();
      installCrashHandlers();
    }).not.toThrow();
  });
});

// The traps are the whole point — a reporter wired to nothing reports nothing. A stub window is enough to
// prove both channels reach reportCrash, without pulling in a DOM implementation.
describe("channel traps", () => {
  const withStubWindow = (run: (fire: (type: string, ev: unknown) => void) => void): void => {
    const handlers = new Map<string, (ev: unknown) => void>();
    const prior = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      addEventListener: (type: string, fn: (ev: unknown) => void) => handlers.set(type, fn),
    };
    try {
      installCrashHandlers();
      run((type, ev) => handlers.get(type)?.(ev));
    } finally {
      (globalThis as { window?: unknown }).window = prior;
    }
  };

  test("a window error event is reported", () => {
    withStubWindow((fire) => {
      fire("error", { error: new Error("sync boom") });
      expect(seen()?.detail.message).toBe("sync boom");
      expect(seen()?.source).toBe("error");
    });
  });

  test("a cross-origin error with no .error still reports something useful", () => {
    withStubWindow((fire) => {
      fire("error", { error: null, message: "Script error.", filename: "x.js", lineno: 1, colno: 2 });
      expect(seen()?.detail.message).toContain("Script error.");
    });
  });

  test("an unhandled rejection with a non-Error reason is reported", () => {
    withStubWindow((fire) => {
      fire("unhandledrejection", { reason: "not an error object" });
      expect(seen()?.detail.message).toBe("not an error object");
      expect(seen()?.source).toBe("unhandledrejection");
    });
  });
});

// The dialog is a thin renderer, but "thin" still has to actually render. renderToStaticMarkup needs no
// DOM, so the real component tree (Card, NeoBtn, lucide icons, the checkbox) gets exercised here.
describe("dialog render", () => {
  test("renders nothing when there is no crash", () => {
    expect(renderToStaticMarkup(createElement(CrashOverlay))).toBe("");
  });

  test("renders the report, the title and the copy button", () => {
    reportCrash(new Error("kaboom"));
    const html = renderToStaticMarkup(createElement(CrashOverlay));
    expect(html).toContain("Unexpected error");
    expect(html).toContain("kaboom");
    expect(html).toContain("copy report");
  });

  test("the opt-in checkbox appears only when a sensitive diagnostic is registered", () => {
    reportCrash(new Error("x"));
    expect(renderToStaticMarkup(createElement(CrashOverlay))).not.toContain('type="checkbox"');
    registerDiagnostic("contract source", () => "code", { sensitive: true });
    const html = renderToStaticMarkup(createElement(CrashOverlay));
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("contract source");
  });

  // The dialog sits on a dark Card face, but `color` also carries light-surface tokens ("body on light").
  // Using one here renders near-black on near-black — invisible. Guard both surfaces against that.
  test("never paints text with a light-surface token", () => {
    reportCrash(new Error("contrast"));
    const dialog = renderToStaticMarkup(createElement(CrashOverlay));
    expect(dialog).not.toContain(color.textBody);
    expect(dialog).not.toContain(color.textMutedLt);

    const boundary = new CrashBoundary({ children: null });
    boundary.state = { dead: true };
    const fallback = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(fallback).not.toContain(color.textBody);
    expect(fallback).not.toContain(color.textMutedLt);
  });

  test("a repeat count badge appears only once the error repeats", () => {
    reportCrash(new Error("again"));
    expect(renderToStaticMarkup(createElement(CrashOverlay))).not.toContain("×");
    reportCrash(new Error("again"));
    expect(renderToStaticMarkup(createElement(CrashOverlay))).toContain("×2");
  });
});

describe("boundary", () => {
  test("renders children while healthy", () => {
    const html = renderToStaticMarkup(createElement(CrashBoundary, null, createElement("p", null, "alive")));
    expect(html).toContain("alive");
  });

  test("a caught render error becomes a report on the react channel", () => {
    const boundary = new CrashBoundary({ children: null });
    boundary.componentDidCatch(new Error("render boom"), { componentStack: "\n    at Editor" });
    expect(seen()?.detail.message).toBe("render boom");
    expect(seen()?.source).toBe("react");
    expect(seen()?.extra).toContain("at Editor");
    expect(CrashBoundary.getDerivedStateFromError()).toEqual({ dead: true });
  });

  test("the dead-state fallback offers a way out", () => {
    const boundary = new CrashBoundary({ children: null });
    boundary.state = { dead: true };
    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html).toContain("unexpected error");
    expect(html).toContain("reload page");
  });
});
