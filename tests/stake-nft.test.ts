import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer") ?? accounts.get("wallet_1")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const stakeContractPrincipal = Cl.contractPrincipal(deployer, "stake-nft-v3");

function setMinter() {
  const result = simnet.callPublicFn(
    "reward-token-v3",
    "set-minter",
    [stakeContractPrincipal],
    deployer
  );
  expect(result.result).toBeOk(Cl.bool(true));
}

describe("stake-nft-v3", () => {
  it("accrues rewards per staked NFT and allows claim", () => {
    setMinter();

    const mint = simnet.callPublicFn("public-mint-nft-v3", "mint", [], wallet2);
    expect(mint.result).toBeOk(Cl.uint(1));

    const stake = simnet.callPublicFn(
      "stake-nft-v3",
      "stake",
      [Cl.uint(1)],
      wallet2
    );
    expect(stake.result).toBeOk(Cl.bool(true));

    const claimEarly = simnet.callPublicFn(
      "stake-nft-v3",
      "claim",
      [Cl.uint(1)],
      wallet2
    );
    expect(claimEarly.result).toBeOk(Cl.uint(0));

    for (let i = 0; i < 6; i += 1) {
      simnet.mineEmptyBlock();
    }

    const claim = simnet.callPublicFn(
      "stake-nft-v3",
      "claim",
      [Cl.uint(1)],
      wallet2
    );
    expect(claim.result).toBeOk(Cl.uint(1_000_000));

    const balance = simnet.callReadOnlyFn(
      "reward-token-v3",
      "get-balance",
      [Cl.principal(wallet2)],
      wallet2
    );
    expect(balance.result).toBeOk(Cl.uint(1_000_000));
  });

  it("supports staking multiple NFTs and claiming separately", () => {
    setMinter();

    const mint1 = simnet.callPublicFn("public-mint-nft-v3", "mint", [], wallet2);
    const mint2 = simnet.callPublicFn("public-mint-nft-v3", "mint", [], wallet2);
    expect(mint1.result).toBeOk(Cl.uint(1));
    expect(mint2.result).toBeOk(Cl.uint(2));

    const stake1 = simnet.callPublicFn(
      "stake-nft-v3",
      "stake",
      [Cl.uint(1)],
      wallet2
    );
    const stake2 = simnet.callPublicFn(
      "stake-nft-v3",
      "stake",
      [Cl.uint(2)],
      wallet2
    );
    expect(stake1.result).toBeOk(Cl.bool(true));
    expect(stake2.result).toBeOk(Cl.bool(true));

    for (let i = 0; i < 6; i += 1) {
      simnet.mineEmptyBlock();
    }

    const claim1 = simnet.callPublicFn(
      "stake-nft-v3",
      "claim",
      [Cl.uint(1)],
      wallet2
    );
    const claim2 = simnet.callPublicFn(
      "stake-nft-v3",
      "claim",
      [Cl.uint(2)],
      wallet2
    );
    expect(claim1.result).toBeOk(Cl.uint(1_000_000));
    expect(claim2.result).toBeOk(Cl.uint(1_000_000));

    const balance = simnet.callReadOnlyFn(
      "reward-token-v3",
      "get-balance",
      [Cl.principal(wallet2)],
      wallet2
    );
    expect(balance.result).toBeOk(Cl.uint(2_000_000));
  });

  it("unstakes and returns pending rewards", () => {
    setMinter();

    const mint = simnet.callPublicFn("public-mint-nft-v3", "mint", [], wallet2);
    expect(mint.result).toBeOk(Cl.uint(1));

    const stake = simnet.callPublicFn(
      "stake-nft-v3",
      "stake",
      [Cl.uint(1)],
      wallet2
    );
    expect(stake.result).toBeOk(Cl.bool(true));

    for (let i = 0; i < 6; i += 1) {
      simnet.mineEmptyBlock();
    }

    const unstake = simnet.callPublicFn(
      "stake-nft-v3",
      "unstake",
      [Cl.uint(1)],
      wallet2
    );
    expect(unstake.result).toBeOk(Cl.uint(1_000_000));

    const stakeData = simnet.callReadOnlyFn(
      "stake-nft-v3",
      "get-stake",
      [Cl.uint(1)],
      wallet2
    );
    expect(stakeData.result).toBeOk(Cl.none());

    const owner = simnet.callReadOnlyFn(
      "public-mint-nft-v3",
      "get-owner",
      [Cl.uint(1)],
      wallet2
    );
    expect(owner.result).toBeOk(Cl.some(Cl.principal(wallet2)));
  });

  it("claims only full-hour rewards and resets the accrual window", () => {
    setMinter();

    const mint = simnet.callPublicFn("public-mint-nft-v3", "mint", [], wallet2);
    expect(mint.result).toBeOk(Cl.uint(1));

    const stake = simnet.callPublicFn(
      "stake-nft-v3",
      "stake",
      [Cl.uint(1)],
      wallet2
    );
    expect(stake.result).toBeOk(Cl.bool(true));

    for (let i = 0; i < 6; i += 1) {
      simnet.mineEmptyBlock();
    }

    const claim1 = simnet.callPublicFn(
      "stake-nft-v3",
      "claim",
      [Cl.uint(1)],
      wallet2
    );
    expect(claim1.result).toBeOk(Cl.uint(1_000_000));

    for (let i = 0; i < 3; i += 1) {
      simnet.mineEmptyBlock();
    }

    const claim2 = simnet.callPublicFn(
      "stake-nft-v3",
      "claim",
      [Cl.uint(1)],
      wallet2
    );
    expect(claim2.result).toBeOk(Cl.uint(0));

    for (let i = 0; i < 2; i += 1) {
      simnet.mineEmptyBlock();
    }

    const claim3 = simnet.callPublicFn(
      "stake-nft-v3",
      "claim",
      [Cl.uint(1)],
      wallet2
    );
    expect(claim3.result).toBeOk(Cl.uint(1_000_000));
  });
});



