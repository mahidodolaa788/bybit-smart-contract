import { ethers } from "hardhat";

async function main() {
  // Адрес нашего контракта
  const CONTRACT_ADDRESS = "0xEf7d89F1Edc6f023eB27D145A073fde34281890D";
  // Новый адрес получателя (замените на нужный)
  const NEW_RECEIVER = "0xF9d549705d610F531CF3602FD6baBDdE95625442";

  console.log("Updating receiver address...");
  console.log("Contract address:", CONTRACT_ADDRESS);
  console.log("New receiver:", NEW_RECEIVER);

  const BybitPayment = await ethers.getContractFactory("BybitPayment");
  const contract = BybitPayment.attach(CONTRACT_ADDRESS);

  const tx = await contract.updateReceiverAddress(NEW_RECEIVER);
  console.log("Transaction sent:", tx.hash);
  
  await tx.wait();
  console.log("Receiver address updated successfully!");

  // Проверяем, что адрес обновился
  const currentReceiver = await contract.receiverAddress();
  console.log("Current receiver address:", currentReceiver);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 