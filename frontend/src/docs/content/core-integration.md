---
title: Ship to Qubic Core
group: Guides
order: 13
---

Everything so far ran on your own node, where a contract is deployed as Wasm in seconds. Mainnet works differently: every mainnet contract is C++ compiled into the node itself, in the [Qubic Core](https://github.com/qubic/core) repository. Going live means getting your header into that repository by pull request, and getting the computors to vote it in.

`qinit integrate` does the mechanical part: it puts your contract into a Core checkout exactly the way Core expects, so what is left is building, review, and the proposal.

## Before you integrate

The header that goes to Core is the one in your project. Make sure it is ready:

```bash
qinit verify
qinit build --production
qinit gtest
```

- `verify` runs the same contract verifier Core's CI runs on every pull request.
- `--production` builds without cheatcodes, as Core will. `integrate` strips `CC_*` calls itself, and refuses if a cheatcode is misused or one is still left.
- `gtest` runs `tests/<Name>.test.cpp`. That file goes to Core with the contract, so it is your contract's test suite upstream too.

Pick two things up front:

- An **asset name** for the contract's shares: at most 7 characters, capital letters and digits, starting with a letter (`MYTOKEN`). Check that no existing contract uses it.
- A **construction epoch**: the first epoch the contract runs in. See "Getting it accepted" below for how it follows from the proposal.

## Run it

```bash
qinit integrate contracts/Mytoken.h --asset MYTOKEN --construction-epoch 200
```

```text
✓ check contract  Mytoken.h  103ms
✓ Core checkout   cloned main  15.1s
✓ wire contract   created index 31  72ms
✓ created contract index 31
core /home/you/Mytoken-core
branch qinit/mytoken
test /home/you/Mytoken-core/test/contract_mytoken.cpp

next (Windows):
cd "/home/you/Mytoken-core"
nuget restore Qubic.sln
msbuild /m /p:Configuration=Release Qubic.sln /t:Qubic:Rebuild /warnaserror
msbuild /m /p:Configuration=Release Qubic.sln /t:test:Rebuild /warnaserror
.\x64\Release\test.exe --gtest_filter=Mytoken.*
```

Three steps ran:

1. **check contract**: cheatcodes stripped, Qinit's build rules and the contract verifier passed. Nothing is touched if this fails.
2. **Core checkout**: Qubic Core cloned next to your project, into `../Mytoken-core`. Pass `--out <dir>` to choose the place, or to use a checkout you already have; it must be clean.
3. **wire contract**: the contract added under the next free contract index, on a new branch `qinit/mytoken`.

Run in a terminal without the flags, `integrate` asks for the asset name and epoch. `--destruction-epoch` defaults to `10000`, as for every Core contract.

## What it changed

```bash
cd ../Mytoken-core
git status --short
```

```text
 M src/Qubic.vcxproj
 M src/Qubic.vcxproj.filters
 M src/contract_core/contract_def.h
 M test/test.vcxproj
 M test/test.vcxproj.filters
?? src/contracts/Mytoken.h
?? test/contract_mytoken.cpp
```

- `src/contracts/Mytoken.h` is your header, cheatcodes removed, nothing else changed.
- `src/contract_core/contract_def.h` registers it in the three places Core needs:

```cpp
#define Mytoken_CONTRACT_INDEX 31
#define CONTRACT_INDEX Mytoken_CONTRACT_INDEX
#define CONTRACT_STATE_TYPE Mytoken
#define CONTRACT_STATE2_TYPE Mytoken2
#include "contracts/Mytoken.h"
```

```cpp
{"MYTOKEN", 200, 10000, sizeof(Mytoken::StateData) < sizeof(IPO) ? sizeof(IPO) : sizeof(Mytoken::StateData)},
```

```cpp
REGISTER_CONTRACT_FUNCTIONS_AND_PROCEDURES(Mytoken);
```

- `test/contract_mytoken.cpp` is your `tests/Mytoken.test.cpp`.
- The `.vcxproj` files add both to Core's Visual Studio projects.

Nothing is committed or pushed. Until you commit, `git restore . && git clean -fd` in the checkout undoes all of it.

## Finish in the Core checkout

### Review the diff

It is your pull request; read it as a reviewer would.

### Build and test

Core's reference build is Visual Studio on Windows with warnings as errors. The commands are the ones `integrate` printed. Zero warnings and green tests are a condition for review.

### Commit, and move the branch onto `develop`

Core takes pull requests against `develop`, while `integrate` starts from `main`:

```bash
git add -A
git commit -m "Add Mytoken contract"
git fetch origin develop
git rebase --onto FETCH_HEAD main
```

If `develop` already holds a contract that `main` does not, the rebase stops on `contract_def.h`. Keep both contracts and give yours the next free index.

### Push and open the pull request

Push to your fork and open the pull request against `develop` of `qubic/core`. Core names contract branches `feature/YYYY-MM-DD-YourContractName`:

```bash
git remote add fork https://github.com/<you>/core.git
git push fork HEAD:feature/2026-10-02-Mytoken
```

Core's convention is a state struct named in capitals (`QX`, `QUOTTERY`). `integrate` keeps the name your header uses, so if you want to follow the convention, name the contract that way in your project before you integrate.

Describe what the contract does in the pull request, and ask a Core developer for review. They review for the restricted C++ subset and style; correctness and the safety of funds stay your responsibility.

## Getting it accepted

A merged pull request does not put a contract on mainnet. The computors decide:

1. **Proposal.** Add a description of the contract and its final source to [qubic/proposal](https://github.com/qubic/proposal/tree/main/SmartContracts).
2. **Vote, epoch N.** A computor operator submits the proposal through the `GQMPROP` contract. Computors vote until the end of the epoch.
3. **IPO, epoch N+1.** If the vote passes, the contract's shares are sold in an IPO. The QU collected fill the contract's execution fee reserve.
4. **Construction, epoch N+2.** If all shares were sold, the contract is constructed: its state is initialized and its procedures and functions can be called.

The construction epoch in `contract_def.h`, your `--construction-epoch`, is **N+2**: a proposal made in epoch 198 means `--construction-epoch 200`.

Before a release, Core also runs the contract in a multi-node test network.

## Update a live contract

Run `integrate` again from your project. It recognises the registered contract, keeps its index, asset name and epochs, and replaces the header and the test:

```bash
qinit integrate contracts/Mytoken.h
```

On a fresh checkout the branch is `qinit/mytoken-update`.

- A **bugfix** that leaves the state alone can ship at any time.
- A **state change** needs `OldStateData` and `MIGRATE` in the contract, and a `contractStateChangeInfos` entry in `contract_def.h`. See [Migrate state](/docs/migrate-state).
- **New features** need the computors' approval again, but no second IPO.

## Develop a live system contract

A contract that is already part of core (QUTIL, QX, …) is developed as an ordinary project. Its struct and every name prefixed with it stay as core has them; only the deploy name is yours:

```bash
qinit new MyQutil
cp $CORE/src/contracts/QUtil.h MyQutil/contracts/MyQutil.h
cd MyQutil
qinit build
```

The header still declares `struct QUTIL`, so core's verifier accepts every `QUTIL_*` name, and the build applies the rules core's own contracts build under. `build`, `test`, `dev`, `deploy`, `call` and `gtest` work as for any project. The contract deploys as `MyQutil` into a free slot on the simulator and on a core-lite node alike; the native QUTIL stays at its own slot, since a node embeds its system contracts as compiled code.

Another contract in the same project that calls `QUTIL::` binds to your header, not to the native one. Core's own contracts keep calling the native slot.

`qinit gtest` runs core's own suite against your header once `test/contract_qutil.cpp` is copied to `tests/MyQutil.test.cpp`. To ship the change back, run `qinit integrate` from the project: it recognises the registered contract and opens the `qinit/qutil-update` branch, or copy the header into your core checkout and open the pull request from there.
