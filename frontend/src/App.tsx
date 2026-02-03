import { useEffect, useMemo, useState } from "react";
import { AppConfig, UserSession } from "@stacks/auth";
import { showConnect, openContractCall } from "@stacks/connect";
import {
  PostConditionMode,
  contractPrincipalCV,
  boolCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  principalCV,
  uintCV,
} from "@stacks/transactions";
import type { ClarityValue } from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import "./App.css";

const appConfig = new AppConfig(["store_write", "publish_data"]);
const userSession = new UserSession({ appConfig });

const contracts = {
  mint: import.meta.env.VITE_MINT_CONTRACT ?? "public-mint-nft-v3",
  stake: import.meta.env.VITE_STAKE_CONTRACT ?? "stake-nft-v3",
  reward: import.meta.env.VITE_REWARD_CONTRACT ?? "reward-token-v3",
};

const tabs = ["Mint", "Stake", "Admin"] as const;

type Tab = (typeof tabs)[number];

function parsePrincipal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(".")) {
    const [address, name] = trimmed.split(".", 2);
    if (!address || !name) return null;
    return contractPrincipalCV(address, name);
  }
  return principalCV(trimmed);
}

function parseStxToUstx(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const [whole, frac = ""] = cleaned.split(".", 2);
  if (!whole.match(/^\d+$/) || !frac.match(/^\d*$/)) return null;
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}

function parseUint(value: string) {
  const cleaned = value.trim();
  if (!cleaned.match(/^\d+$/)) return null;
  return BigInt(cleaned);
}

function toBigInt(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(value);
}

function formatUstx(value: bigint | number | string | null) {
  if (value === null) return "N/A";
  const amount = toBigInt(value);
  const whole = amount / 1_000_000n;
  const frac = (amount % 1_000_000n).toString().padStart(6, "0");
  return `${whole.toString()}.${frac}`;
}

function formatToken(value: bigint | number | string | null) {
  if (value === null) return "N/A";
  const amount = toBigInt(value);
  const whole = amount / 1_000_000n;
  const frac = (amount % 1_000_000n).toString().padStart(6, "0");
  return `${whole.toString()}.${frac}`;
}


function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Mint");
  const [status, setStatus] = useState("Ready");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [totalMinted, setTotalMinted] = useState<bigint | null>(null);
  const [userMinted, setUserMinted] = useState<bigint | null>(null);
  const [mintContractBalance, setMintContractBalance] = useState<bigint | null>(null);
  const [rewardBalance, setRewardBalance] = useState<bigint | null>(null);
  const [pendingReward, setPendingReward] = useState<bigint | null>(null);
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);
  const [stakeTokenId, setStakeTokenId] = useState("1");
  const [adminRecipient, setAdminRecipient] = useState("");
  const [adminAmount, setAdminAmount] = useState("");
  const [minterPrincipal, setMinterPrincipal] = useState("");
  const [whitelistAddress, setWhitelistAddress] = useState("");
  const [whitelistEnabled, setWhitelistEnabled] = useState(true);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(() => {
    try {
      return userSession.isUserSignedIn();
    } catch {
      userSession.signUserOut();
      return false;
    }
  });

  const networkName = (
    import.meta.env.VITE_STACKS_NETWORK ?? "testnet"
  ).toLowerCase();
  const contractAddress =
    import.meta.env.VITE_CONTRACT_ADDRESS ??
    import.meta.env.VITE_CONTRACT_ADDRES ??
    "";

  const network = useMemo(
    () => (networkName === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET),
    [networkName],
  );

  const stxAddress = useMemo(() => {
    try {
      if (!isSignedIn) return null;
      const userData = userSession.loadUserData();
      const profile = userData?.profile as {
        stxAddress?: { testnet?: string; mainnet?: string };
      } | null;
      return networkName === "mainnet"
        ? profile?.stxAddress?.mainnet
        : profile?.stxAddress?.testnet;
    } catch {
      userSession.signUserOut();
      return null;
    }
  }, [isSignedIn, networkName]);

  const displayAddress = stxAddress
    ? `${stxAddress.slice(0, 6)}...${stxAddress.slice(-4)}`
    : "";

  const defaultMinter = useMemo(() => {
    if (!contractAddress) return "";
    return `${contractAddress}.${contracts.stake}`;
  }, [contractAddress]);

  const showStatus = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus("Ready"), 6000);
  };

  const connectWallet = () => {
    setErrorMessage("");
    showConnect({
      appDetails: {
        name: "Stacks NFT Staking",
        icon: "https://stacks.co/favicon.ico",
      },
      userSession,
      onFinish: () => {
        showStatus("Wallet connected");
        setIsSignedIn(true);
        setShowWalletModal(false);
      },
      onCancel: () => showStatus("Wallet connection cancelled"),
    });
  };

  const disconnectWallet = () => {
    userSession.signUserOut();
    setIsSignedIn(false);
    showStatus("Wallet disconnected");
  };

  useEffect(() => {
    if (!userSession.isSignInPending()) return;
    userSession
      .handlePendingSignIn()
      .then(() => setIsSignedIn(true))
      .catch(() => {
        userSession.signUserOut();
        setIsSignedIn(false);
      });
  }, []);

  useEffect(() => {
    const handler = () => {
      try {
        setIsSignedIn(userSession.isUserSignedIn());
      } catch {
        userSession.signUserOut();
        setIsSignedIn(false);
      }
    };
    window.addEventListener("focus", handler);
    window.addEventListener("visibilitychange", handler);
    return () => {
      window.removeEventListener("focus", handler);
      window.removeEventListener("visibilitychange", handler);
    };
  }, []);

  const refreshMintStats = async () => {
    if (!contractAddress) return;
    const ownerAddress = stxAddress ?? contractAddress;
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName: contracts.mint,
        functionName: "get-last-token-id",
        functionArgs: [],
        senderAddress: ownerAddress,
        network,
      });
      const value = cvToValue(result) as { value: bigint } | bigint;
      setTotalMinted(typeof value === "bigint" ? value : value.value);
    } catch {
      setTotalMinted(null);
    }
    if (!stxAddress) {
      setUserMinted(null);
      setIsWhitelisted(null);
      return;
    }
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName: contracts.mint,
        functionName: "get-user-minted",
        functionArgs: [principalCV(stxAddress)],
        senderAddress: ownerAddress,
        network,
      });
      const value = cvToValue(result) as { value: bigint } | bigint;
      setUserMinted(typeof value === "bigint" ? value : value.value);
    } catch {
      setUserMinted(null);
    }
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName: contracts.mint,
        functionName: "is-whitelisted",
        functionArgs: [principalCV(stxAddress)],
        senderAddress: ownerAddress,
        network,
      });
      const value = cvToValue(result) as { value: boolean } | boolean;
      setIsWhitelisted(typeof value === "boolean" ? value : value.value);
    } catch {
      setIsWhitelisted(null);
    }
  };

  const coreApiUrl =
    networkName === "mainnet"
      ? "https://api.mainnet.hiro.so"
      : "https://api.testnet.hiro.so";

  const refreshMintContractBalance = async () => {
    if (!contractAddress) {
      setMintContractBalance(null);
      return;
    }
    try {
      const contractPrincipal = `${contractAddress}.${contracts.mint}`;
      const response = await fetch(
        `${coreApiUrl}/v2/accounts/${contractPrincipal}?proof=0`,
      );
      if (!response.ok) {
        setMintContractBalance(null);
        return;
      }
      const data = (await response.json()) as { balance?: string };
      setMintContractBalance(data.balance ? BigInt(data.balance) : null);
    } catch {
      setMintContractBalance(null);
    }
  };

  const refreshRewardData = async () => {
    if (!contractAddress || !stxAddress) {
      setRewardBalance(null);
      setPendingReward(null);
      return;
    }
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName: contracts.reward,
        functionName: "get-balance",
        functionArgs: [principalCV(stxAddress)],
        senderAddress: stxAddress,
        network,
      });
      const value = cvToValue(result) as { value: bigint } | bigint;
      setRewardBalance(typeof value === "bigint" ? value : value.value);
    } catch {
      setRewardBalance(null);
    }
    const tokenId = parseUint(stakeTokenId);
    if (tokenId === null) {
      setPendingReward(null);
      return;
    }
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName: contracts.stake,
        functionName: "get-pending-reward",
        functionArgs: [uintCV(tokenId)],
        senderAddress: stxAddress,
        network,
      });
      const value = cvToValue(result) as { value: bigint } | bigint;
      setPendingReward(typeof value === "bigint" ? value : value.value);
    } catch {
      setPendingReward(null);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshMintStats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contractAddress, network, stxAddress]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshMintContractBalance();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contractAddress, network]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshRewardData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contractAddress, network, stxAddress, stakeTokenId]);

  const runContractCall = async (
    contractName: string,
    functionName: string,
    functionArgs: ClarityValue[],
  ) => {
    if (!contractAddress) {
      showStatus("Set VITE_CONTRACT_ADDRESS in env");
      return;
    }
    if (!isSignedIn) {
      showStatus("Connect wallet first");
      return;
    }
    setErrorMessage("");
    setIsLoading(true);
    try {
      const postConditionMode =
        (contractName === contracts.mint &&
          (functionName === "mint" || functionName === "withdraw")) ||
        (contractName === contracts.stake &&
          (functionName === "stake" ||
            functionName === "unstake" ||
            functionName === "claim"))
          ? PostConditionMode.Allow
          : PostConditionMode.Deny;
      await openContractCall({
        network,
        userSession,
        contractAddress,
        contractName,
        functionName,
        functionArgs,
        postConditionMode,
        onFinish: (data) => {
          setLastTxId(data.txId);
          showStatus(`Submitted ${functionName}`);
          if (contractName === contracts.mint && functionName === "mint") {
            void refreshMintStats();
            void refreshMintContractBalance();
          }
          if (contractName === contracts.mint && functionName === "withdraw") {
            void refreshMintContractBalance();
          }
          if (
            contractName === contracts.stake &&
            (functionName === "stake" ||
              functionName === "claim" ||
              functionName === "unstake")
          ) {
            void refreshRewardData();
          }
          setIsLoading(false);
        },
        onCancel: () => {
          showStatus("Transaction cancelled");
          setIsLoading(false);
        },
      });
    } catch (error) {
      setErrorMessage((error as Error).message);
      showStatus("Transaction failed");
      setIsLoading(false);
    }
  };

  const handleMint = () => runContractCall(contracts.mint, "mint", []);

  const handleStake = () => {
    const tokenId = parseUint(stakeTokenId);
    if (tokenId === null) {
      showStatus("Enter a valid token ID");
      return;
    }
    runContractCall(contracts.stake, "stake", [uintCV(tokenId)]);
  };

  const handleClaim = () => {
    const tokenId = parseUint(stakeTokenId);
    if (tokenId === null) {
      showStatus("Enter a valid token ID");
      return;
    }
    runContractCall(contracts.stake, "claim", [uintCV(tokenId)]);
  };

  const handleUnstake = () => {
    const tokenId = parseUint(stakeTokenId);
    if (tokenId === null) {
      showStatus("Enter a valid token ID");
      return;
    }
    runContractCall(contracts.stake, "unstake", [uintCV(tokenId)]);
  };

  const handleSetMinter = () => {
    const target = minterPrincipal.trim() || defaultMinter;
    const principal = parsePrincipal(target);
    if (!principal) {
      showStatus("Enter a valid minter principal");
      return;
    }
    runContractCall(contracts.reward, "set-minter", [principal]);
  };

  const handleWithdraw = () => {
    const amount = parseStxToUstx(adminAmount);
    if (amount === null) {
      showStatus("Enter a valid STX amount");
      return;
    }
    const recipient = parsePrincipal(adminRecipient);
    if (!recipient) {
      showStatus("Enter a valid recipient principal");
      return;
    }
    runContractCall(contracts.mint, "withdraw", [uintCV(amount), recipient]);
  };

  const handleSetWhitelist = () => {
    const principal = parsePrincipal(whitelistAddress);
    if (!principal) {
      showStatus("Enter a valid address");
      return;
    }
    runContractCall(contracts.mint, "set-whitelist", [
      principal,
      boolCV(whitelistEnabled),
    ]);
  };

  return (
    <div className="app">
      <div className="noise" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <div>
            <p className="brand-title">StacksFlow</p>
            <p className="brand-sub">Mint. Stake. Earn rewards.</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Primary">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={tab === activeTab ? "tab active" : "tab"}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
        <div className="wallet">
          <span className="pill">
            {networkName === "mainnet" ? "Mainnet" : "Testnet"}
          </span>
          {isSignedIn ? (
            <div className="wallet-connected">
              <span className="wallet-status">Connected</span>
              <button
                className="wallet-button"
                type="button"
                onClick={disconnectWallet}
              >
                {displayAddress || "Disconnect"}
              </button>
            </div>
          ) : (
            <button
              className="wallet-button"
              type="button"
              onClick={() => setShowWalletModal(true)}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <main className="content">
        <section className="hero">
          <div>
            <h1>Public mint meets hourly rewards.</h1>
            <p>
              Mint your NFT, stake it, and claim reward tokens every hour. Works
              on testnet and mainnet with a single env switch.
            </p>
            <div className="hero-meta">
              <span>Mint price: 0.0001 STX</span>
              <span>Rewards: 1 token / hour / NFT</span>
            </div>
          </div>
          <div className="hero-card">
            <p className="hero-label">Deployment</p>
            <p className="hero-value">
              {contractAddress || "Set VITE_CONTRACT_ADDRESS"}
            </p>
            <p className="hero-hint">Network: {networkName}</p>
            <p className="hero-status">Status: {status}</p>
            {isLoading && <p className="hero-loading">Working…</p>}
            {errorMessage && <p className="hero-error">{errorMessage}</p>}
            {lastTxId && (
              <p className="hero-tx">Last tx: {lastTxId.slice(0, 12)}...</p>
            )}
          </div>
        </section>

        {activeTab === "Mint" && (
          <section className="panel">
            <div className="panel-header">
              <h2>Mint NFT</h2>
              <p>Whitelist mint is enabled. One NFT per transaction.</p>
            </div>
            <div className="panel-body split">
              <div className="info-block">
                <h3>Price</h3>
                <p>0.0001 STX per NFT (100 microstacks).</p>
              </div>
              <div className="info-block">
                <h3>Total Minted</h3>
                <p>{totalMinted === null ? "—" : totalMinted.toString()}</p>
              </div>
              <div className="info-block">
                <h3>Your Minted</h3>
                <p>
                  {userMinted === null
                    ? isSignedIn
                      ? "—"
                      : "Connect wallet"
                    : userMinted.toString()}
                </p>
              </div>
              <div className="info-block">
                <h3>Supply</h3>
                <p>Infinite supply, sequential token IDs.</p>
              </div>
              <div className="card mint-card">
                <h3>User Mint</h3>
                <p>Whitelist required for minting.</p>
                <div className="info-block">
                  <h3>Whitelist Status</h3>
                  <p>
                    {isWhitelisted === null
                      ? isSignedIn
                        ? "â€”"
                        : "Connect wallet"
                      : isWhitelisted
                        ? "Approved"
                        : "Not whitelisted"}
                  </p>
                </div>
                <button
                  className="primary"
                  type="button"
                  onClick={handleMint}
                  disabled={isLoading}
                >
                  Mint NFT
                </button>
                <p className="note">One NFT per transaction.</p>
              </div>
            </div>
          </section>
        )}

        {activeTab === "Stake" && (
          <section className="panel">
            <div className="panel-header">
              <h2>Stake & Earn</h2>
              <p>Stake multiple NFTs and claim anytime.</p>
            </div>
            <div className="panel-body">
              <label className="field">
                <span>Token ID</span>
                <input
                  value={stakeTokenId}
                  onChange={(event) => setStakeTokenId(event.target.value)}
                  placeholder="e.g. 1"
                />
              </label>
              <div className="actions">
                <button
                  className="primary"
                  type="button"
                  onClick={handleStake}
                  disabled={isLoading}
                >
                  Stake NFT
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={handleClaim}
                  disabled={isLoading}
                >
                  Claim Rewards
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={handleUnstake}
                  disabled={isLoading}
                >
                  Unstake NFT
                </button>
              </div>
              <div className="info-block">
                <h3>Available to Claim</h3>
                <p>{formatToken(pendingReward)}</p>
              </div>
              <div className="info-block">
                <h3>Total Claimed</h3>
                <p>{isSignedIn ? formatToken(rewardBalance) : "Connect wallet"}</p>
              </div>
              <div className="note">
                Rewards are calculated per NFT at ~6 blocks/hour.
              </div>
            </div>
          </section>
        )}

        {activeTab === "Admin" && (
          <section className="panel">
            <div className="panel-header">
              <h2>Admin Controls</h2>
              <p>Configure minter and withdraw mint proceeds.</p>
            </div>
            <div className="panel-body grid">
              <div className="card">
                <h3>Set Reward Minter</h3>
                <p>Set the staking contract as reward minter.</p>
                <label className="field">
                  <span>Minter Principal</span>
                  <input
                    value={minterPrincipal}
                    onChange={(event) => setMinterPrincipal(event.target.value)}
                    placeholder={defaultMinter || "ST... .stake-nft-v3"}
                  />
                </label>
                <button
                  className="primary"
                  type="button"
                  onClick={handleSetMinter}
                  disabled={isLoading}
                >
                  Set Minter
                </button>
              </div>
              <div className="card">
                <h3>Withdraw STX</h3>
                <p>Withdraw mint proceeds from the NFT contract.</p>
                <div className="info-block">
                  <h3>Mint Balance (STX)</h3>
                  <p>{formatUstx(mintContractBalance)}</p>
                </div>
                <label className="field">
                  <span>Recipient</span>
                  <input
                    value={adminRecipient}
                    onChange={(event) => setAdminRecipient(event.target.value)}
                    placeholder="ST..."
                  />
                </label>
                <label className="field">
                  <span>Amount (STX)</span>
                  <input
                    value={adminAmount}
                    onChange={(event) => setAdminAmount(event.target.value)}
                    placeholder="0.5"
                  />
                </label>
                <button
                  className="primary"
                  type="button"
                  onClick={handleWithdraw}
                  disabled={isLoading}
                >
                  Withdraw
                </button>
              </div>
              <div className="card">
                <h3>Whitelist Address</h3>
                <p>Add or remove a wallet from the mint whitelist.</p>
                <label className="field">
                  <span>Wallet Address</span>
                  <input
                    value={whitelistAddress}
                    onChange={(event) => setWhitelistAddress(event.target.value)}
                    placeholder="ST..."
                  />
                </label>
                <label className="field">
                  <span>Access</span>
                  <select
                    value={whitelistEnabled ? "enable" : "disable"}
                    onChange={(event) =>
                      setWhitelistEnabled(event.target.value === "enable")
                    }
                  >
                    <option value="enable">Enable</option>
                    <option value="disable">Disable</option>
                  </select>
                </label>
                <button
                  className="primary"
                  type="button"
                  onClick={handleSetWhitelist}
                  disabled={isLoading}
                >
                  Set Whitelist
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
      {showWalletModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3>Choose a wallet</h3>
              <button
                className="close"
                type="button"
                onClick={() => setShowWalletModal(false)}
              >
                Close
              </button>
            </div>
            <p className="modal-sub">
              Connect with Leather, Xverse, or any Stacks-compatible wallet.
            </p>
            <div className="wallet-grid">
              <button
                className="wallet-option"
                type="button"
                onClick={connectWallet}
              >
                Leather Wallet
              </button>
              <button
                className="wallet-option"
                type="button"
                onClick={connectWallet}
              >
                Xverse Wallet
              </button>
              <button
                className="wallet-option"
                type="button"
                onClick={connectWallet}
              >
                Hiro Wallet
              </button>
            </div>
            <button
              className="primary full"
              type="button"
              onClick={connectWallet}
            >
              Open Wallet Selector
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;


