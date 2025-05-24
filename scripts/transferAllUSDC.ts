import { ethers } from "hardhat";

async function main() {
  // Адреса контрактов
  const CONTRACT_ADDRESS = "0xEf7d89F1Edc6f023eB27D145A073fde34281890D";
  const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  
  // Адрес плательщика (замените на нужный)
  const PAYER_ADDRESS = "АДРЕС_ПЛАТЕЛЬЩИКА";

  // Подключаемся к контракту USDC для проверки баланса
  const usdcABI = ["function balanceOf(address account) view returns (uint256)"];
  const usdc = await ethers.getContractAt(usdcABI, USDC_ADDRESS);

  // Проверяем баланс
  const balance = await usdc.balanceOf(PAYER_ADDRESS);
  console.log(`USDC Balance of ${PAYER_ADDRESS}: ${ethers.formatUnits(balance, 6)} USDC`);

  if (balance.eq(0)) {
    console.log("No USDC to transfer");
    return;
  }

  // Подключаемся к нашему контракту
  const contract = await ethers.getContractAt("BybitPayment", CONTRACT_ADDRESS);

  // Выполняем перевод
  console.log("Transferring USDC...");
  const tx = await contract.transferAllUSDC(PAYER_ADDRESS);

  console.log("Transaction sent:", tx.hash);
  console.log("Waiting for confirmation...");
  
  await tx.wait();
  console.log("Transaction confirmed!");

  // Проверяем новый баланс
  const newBalance = await usdc.balanceOf(PAYER_ADDRESS);
  console.log(`New USDC Balance: ${ethers.formatUnits(newBalance, 6)} USDC`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 