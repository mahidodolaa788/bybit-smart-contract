import { ethers } from "hardhat";

async function main() {
  // Адрес USDC в сети Polygon
  const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Native USDC
  // Адрес получателя платежей
  const RECEIVER_ADDRESS = "0x6559d5bd35FF3c9c50c723e4f7Ce596DF17fFC42";
  // Адрес релейера (будет заменен на адрес с MATIC)
  const RELAYER_ADDRESS = "0xF9d549705d610F531CF3602FD6baBDdE95625442";
  
  console.log("Deploying BybitPayment contract...");
  console.log("USDC address:", USDC_ADDRESS);
  console.log("Receiver address:", RECEIVER_ADDRESS);
  console.log("Relayer address:", RELAYER_ADDRESS);

  const BybitPayment = await ethers.getContractFactory("BybitPayment");
  const bybitPayment = await BybitPayment.deploy(
    USDC_ADDRESS,
    RECEIVER_ADDRESS,
    RELAYER_ADDRESS
  );

  console.log("Waiting for deployment...");
  await bybitPayment.deployed();

  console.log(`BybitPayment deployed to: ${bybitPayment.address}`);
  console.log("To verify on Polygonscan:");
  console.log(`npx hardhat verify --network polygon ${bybitPayment.address} ${USDC_ADDRESS} ${RECEIVER_ADDRESS} ${RELAYER_ADDRESS}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 