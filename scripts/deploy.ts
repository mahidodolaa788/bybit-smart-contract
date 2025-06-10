import { ethers, network } from "hardhat";

const config = {
  polygon: {
    url: "https://polygon-rpc.com",
    accounts: [process.env.PRIVATE_KEY!],
    chainId: 137,
    USDC: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    receiver: "0x68FBAaCa99E05DB091c5b325c57Dc3534CE3fa1a",
  },
  // amoy: {
  //   url: "https://rpc-amoy.polygon.technology",
  //   accounts: [process.env.PRIVATE_KEY!],
  //   chainId: 80002,
  //   USDC: "0x...testnet",
  //   receiver: "0x...testnet",
  // },
} as const;

type NetworkName = keyof typeof config;

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is not set in environment variables");
  }

  // @ts-ignore
  const networkConfig = config[network.name as any];
  if (!networkConfig) {
    throw new Error(`No config found for network: ${network.name}`);
  }
  // Адрес USDC в сети Polygon
  const USDC_ADDRESS = networkConfig.USDC;
  // Адрес получателя платежей
  const RECEIVER_ADDRESS = networkConfig.receiver;
  
  console.log("Deploying BybitPayment contract...");
  console.log("USDC address:", USDC_ADDRESS);
  console.log("Receiver address:", RECEIVER_ADDRESS);

  // Hardhat автоматически компилирует .sol файлы и сохраняет результат (ABI + байткод) в artifacts/.
  // Эта функция ищет среди этих артефактов нужный контракт по имени.
  const BybitPayment = await ethers.getContractFactory("BybitPayment");
  const bybitPayment = await BybitPayment.deploy(
    USDC_ADDRESS,
    RECEIVER_ADDRESS,
    RECEIVER_ADDRESS,
  );

  console.log("Waiting for deployment...");
  await bybitPayment.deployed();

  console.log(`BybitPayment deployed to: ${bybitPayment.address}`);
  console.log("To verify on Polygonscan:");
  console.log(`npx hardhat verify --network polygon ${bybitPayment.address} ${USDC_ADDRESS} ${RECEIVER_ADDRESS} ${RECEIVER_ADDRESS}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 