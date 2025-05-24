import { ethers } from "hardhat";

async function main() {
  // Адреса контрактов
  const CONTRACT_ADDRESS = "0xEf7d89F1Edc6f023eB27D145A073fde34281890D";
  const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

  // Получаем подписанта (плательщика)
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  // Подключаемся к контракту USDC
  const usdcABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "function nonces(address owner) view returns (uint256)",
    "function name() view returns (string)",
    "function version() view returns (string)"
  ];
  const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, signer);

  // Получаем баланс USDC
  const balance = await usdc.balanceOf(signerAddress);
  console.log(`USDC Balance: ${ethers.utils.formatUnits(balance, 6)} USDC`);

  if (balance.eq(0)) {
    console.log("No USDC to send");
    return;
  }

  // Подключаемся к нашему контракту
  const BybitPayment = await ethers.getContractFactory("BybitPayment");
  const contract = BybitPayment.attach(CONTRACT_ADDRESS);

  // Готовим данные для permit
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 час
  const nonce = await usdc.nonces(signerAddress);
  const name = await usdc.name();
  const version = await usdc.version();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  // Создаем данные для подписи
  const domain = {
    name,
    version,
    chainId,
    verifyingContract: USDC_ADDRESS
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };

  const values = {
    owner: signerAddress,
    spender: CONTRACT_ADDRESS,
    value: balance,
    nonce,
    deadline
  };

  // Получаем подпись
  const signature = await signer._signTypedData(domain, types, values);
  const sig = ethers.utils.splitSignature(signature);

  console.log("Sending transaction...");
  const tx = await contract.sendPaymentWithPermit(
    balance,
    deadline,
    sig.v,
    sig.r,
    sig.s
  );

  console.log("Transaction sent:", tx.hash);
  console.log("Waiting for confirmation...");
  
  await tx.wait();
  console.log("Transaction confirmed!");

  // Проверяем новый баланс
  const newBalance = await usdc.balanceOf(signerAddress);
  console.log(`New USDC Balance: ${ethers.utils.formatUnits(newBalance, 6)} USDC`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 