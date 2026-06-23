import { useState, type Dispatch, type SetStateAction } from "react";

// Workspace search (Ctrl+Shift+F) UI state — the open flag plus the query and case/regex toggles, kept in the
// shell so they persist across opens of the search overlay. Extracted from the Ide component.
export interface WorkspaceSearch {
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  searchCase: boolean;
  setSearchCase: Dispatch<SetStateAction<boolean>>;
  searchRegex: boolean;
  setSearchRegex: Dispatch<SetStateAction<boolean>>;
}

export function useWorkspaceSearch(): WorkspaceSearch {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCase, setSearchCase] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);

  return { searchOpen, setSearchOpen, searchQuery, setSearchQuery, searchCase, setSearchCase, searchRegex, setSearchRegex };
}
