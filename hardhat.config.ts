import "ts-node/register";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          viaIR: true
        }
      }
    ]
  },
  networks: {
    // и для теста и для прода используется один deployment кошелек
    polygon: {
      url: "https://polygon-rpc.com",
      accounts: [PRIVATE_KEY]
    },
    // amoy: {
    //   url: process.env.AMOY_RPC_URL,
    //   accounts: [PRIVATE_KEY],
    // },
  },
  etherscan: {
    apiKey: {
      polygon: POLYGONSCAN_API_KEY,
      // polygonMumbai: POLYGONSCAN_API_KEY,
    }
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache"
  }
};

export default config;
