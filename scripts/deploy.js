const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Native USDC on Polygon
  const RECEIVER_ADDRESS = "0xF9d549705d610F531CF3602FD6baBDdE95625442";
  const RELAYER_ADDRESS = "0xF9d549705d610F531CF3602FD6baBDdE95625442"; // Using same address for testing

  const BybitPayment = await hre.ethers.getContractFactory("BybitPayment");
  const bybitPayment = await BybitPayment.deploy(
    USDC_ADDRESS,
    RECEIVER_ADDRESS,
    RELAYER_ADDRESS
  );

  await bybitPayment.deployed();

  console.log("BybitPayment deployed to:", bybitPayment.address);
  console.log("USDC address:", USDC_ADDRESS);
  console.log("Receiver address:", RECEIVER_ADDRESS);
  console.log("Relayer address:", RELAYER_ADDRESS);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 