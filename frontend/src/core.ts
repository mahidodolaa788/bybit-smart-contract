import { logger } from "./logger";

const POLYGON_CHAIN_ID = "0x89";

export const tryScan = () => {
  const detectedWallets = [];

  if (window.ethereum) {
    if (window.ethereum.isMetaMask) detectedWallets.push("MetaMask");
    if (window.ethereum.isCoinbaseWallet)
      detectedWallets.push("Coinbase Wallet");
    if (window.ethereum.isTrust) detectedWallets.push("Trust Wallet");
    if (window.ethereum.isBraveWallet) detectedWallets.push("Brave Wallet");
    if (window.ethereum.isTaho) detectedWallets.push("Taho Wallet");
    if (window.ethereum.isFrame) detectedWallets.push("Frame Wallet");
    if (detectedWallets.length === 0)
      detectedWallets.push("Unknown Ethereum-Compatible Wallet");
  }

  if (window.BinanceChain) detectedWallets.push("Binance Wallet");
  if (window.okxwallet) detectedWallets.push("OKX Wallet");
  if (window.rabby) detectedWallets.push("Rabby Wallet");
  if (window.web3 && window.web3.currentProvider)
    detectedWallets.push("Legacy Web3 Wallet");

  // Упрощённый технический лог
  const techLog = {
    ethereum: !!window.ethereum,
    rabby: !!window.rabby,
    web3: !!(window.web3 && window.web3.currentProvider),
    binance: !!window.BinanceChain,
    okx: !!window.okxwallet,
  };

  const message =
    detectedWallets.length > 0
      ? `Обнаружены кошельки: ${detectedWallets.join(", ")}`
      : "Кошельки не обнаружены";

  return { wallets: detectedWallets, techLog, message };
};

export async function scanWallets(retries = 3, delay = 2000) {
  let result = tryScan();

  for (
    let attempt = 1;
    result.wallets.length === 0 && attempt < retries;
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = tryScan();
  }

  return result;
}

export const switchNetwork = async () => {
  if (!window.ethereum) {
    logger.error("Ethereum provider не найден во время переключения сети.");
    throw new Error("Ethereum кошелек не найден");
  }
  logger.log("Переключаем клиента на сеть Polygon...");
  try {
    // это вызов смены сети, который не реализован в ether.js
    // по причине разницы реализаций в разных кошельках
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: POLYGON_CHAIN_ID }],
    });
  } catch (switchError: any) {
    logger.log("Ошибка:", switchError);
    if (switchError.code === 4902) {
      try {
        logger.log(
          "У пользователя отсутствует сеть Polygon, добавляем сеть в кошелек..."
        );
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: POLYGON_CHAIN_ID,
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
};
