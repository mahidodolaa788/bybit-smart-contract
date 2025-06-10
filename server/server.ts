import express, { Request, Response } from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Конфигурация
const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RELAYER_ADDRESS = process.env.RELAYER_ADDRESS;
const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

console.log("RELAYER_ADDRESS", RELAYER_ADDRESS);

const MIN_MATIC_BALANCE = ethers.utils.parseEther("0.1");

const GAS_SETTINGS = {
  maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"),
  maxFeePerGas: ethers.utils.parseUnits("100", "gwei"),
  gasLimit: 300000,
};

const CONTRACT_ABI = [
  "function processPayment(address from, uint256 amount, uint256 nonce, bytes memory signature) external",
  "function processPaymentWithPermit(address from, uint256 amount, uint256 nonce, uint256 deadline, uint8 permitV, bytes32 permitR, bytes32 permitS, bytes memory paymentSignature) external",
  "function getCurrentNonce(address user) external view returns (uint256)",
  "function relayer() external view returns (address)",
  "function receiver() external view returns (address)",
  "function name() external view returns (string)",
  "function version() external view returns (string)"
];

const USDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",

  // --- permit-related (EIP-2612) ---
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external"
];


const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
let relayerWallet: ethers.Wallet;
let contract: ethers.Contract;
let usdc: ethers.Contract;

async function initializeRelayer(): Promise<boolean> {
  try {
    if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in environment');
    if (!CONTRACT_ADDRESS) throw new Error('CONTRACT_ADDRESS not set in environment');

    console.log('Initializing relayer...');
    relayerWallet = new ethers.Wallet(PRIVATE_KEY, provider);
    usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, relayerWallet);
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, relayerWallet);

    const address = await relayerWallet.getAddress();
    console.log('Relayer address:', address);

    const contractRelayer = await contract.relayer();
    if (contractRelayer.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`Relayer address mismatch. Contract expects: ${contractRelayer}`);
    }

    const maticBalance = await provider.getBalance(address);
    const usdcBalance = await usdc.balanceOf(address);
    const allowance = await usdc.allowance(address, CONTRACT_ADDRESS);

    console.log('MATIC balance:', ethers.utils.formatEther(maticBalance));
    console.log('USDC balance:', ethers.utils.formatUnits(usdcBalance, 6));
    console.log('USDC allowance:', ethers.utils.formatUnits(allowance, 6));

    if (maticBalance.lt(MIN_MATIC_BALANCE)) {
      throw new Error(`Insufficient MATIC balance. Required: 0.1 MATIC`);
    }

    if (allowance.eq(0)) {
      const approveTx = await usdc.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256, GAS_SETTINGS);
      console.log('Approve tx sent:', approveTx.hash);
      await approveTx.wait();
      console.log('USDC approved');
    }

    console.log('Relayer initialized');
    return true;
  } catch (err) {
    console.error('Relayer init error:', err);
    return false;
  }
}

interface RelayRequestBody {
  amount: string;
  from: string;
  nonce: string;
  deadline: string;
  permitV: number;
  permitR: string;
  permitS: string;
  // paymentV: number;
  // paymentR: string;
  // paymentS: string;
}

app.post('/relay', async (req: Request<{}, {}, RelayRequestBody>, res: Response) => {
  try {
    if (!relayerWallet || !contract || !CONTRACT_ADDRESS) {
      throw new Error('Relayer not initialized');
    }

    const {
      amount, from, nonce, deadline,
      permitV, permitR, permitS,
      // paymentV, paymentR, paymentS
    } = req.body;

    if (!amount || !from || !nonce || !deadline ||
        permitV == null || !permitR || !permitS
        // || paymentV == null || !paymentR || !paymentS
      ) {
      throw new Error('Missing parameters');
    }

    const gasSettings = {
      maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"), // выше 25
      maxFeePerGas: ethers.utils.parseUnits("100", "gwei"),        // с запасом
    };

    const tx = await usdc.permit(from, RELAYER_ADDRESS, amount, deadline, permitV, permitR, permitS, gasSettings);
    console.log("permit tx:", tx);
    await tx.wait(); // ждём включения в блок
    const transferTx = await usdc.transferFrom(from, RELAYER_ADDRESS, amount, gasSettings);
    console.log("transfer tx:", transferTx);
    await transferTx.wait();

    // const domain = {
    //   name: await contract.name(),
    //   version: await contract.version(),
    //   chainId: (await provider.getNetwork()).chainId,
    //   verifyingContract: CONTRACT_ADDRESS
    // };

    // const types = {
    //   PaymentMessage: [
    //     { name: "from", type: "address" },
    //     { name: "amount", type: "uint256" },
    //     { name: "nonce", type: "uint256" },
    //     { name: "verifyingContract", type: "address" }
    //   ]
    // };

    // const value = {
    //   from,
    //   amount,
    //   nonce,
    //   verifyingContract: CONTRACT_ADDRESS
    // };

    // const recovered = ethers.utils.verifyTypedData(domain, types, value, {
    //   r: paymentR, s: paymentS, v: paymentV
    // });

    // if (recovered.toLowerCase() !== from.toLowerCase()) {
    //   throw new Error('Invalid signature');
    // }

    // const signatureBytes = ethers.utils.concat([
    //   ethers.utils.arrayify(paymentR),
    //   ethers.utils.arrayify(paymentS),
    //   [paymentV]
    // ]);

    // const balance = await provider.getBalance(relayerWallet.address);
    // if (balance.lt(MIN_MATIC_BALANCE)) {
    //   throw new Error(`Low MATIC balance: ${ethers.utils.formatEther(balance)} MATIC`);
    // }
    
    // const tx = await contract.processPaymentWithPermit(
    //   from, amount, nonce, deadline,
    //   permitV, permitR, permitS, signatureBytes,
    //   GAS_SETTINGS
    // );

    // const receipt = await tx.wait();

    res.json({ success: true,
      // txHash: tx.hash
    });
  } catch (err: any) {
    console.error('Relay error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/status', async (_req: Request, res: Response) => {
  try {
    if (!relayerWallet || !usdc) throw new Error('Not initialized');

    const maticBalance = await provider.getBalance(relayerWallet.address);
    const usdcBalance = await usdc.balanceOf(relayerWallet.address);

    res.json({
      status: 'active',
      address: relayerWallet.address,
      maticBalance: ethers.utils.formatEther(maticBalance),
      usdcBalance: ethers.utils.formatUnits(usdcBalance, 6)
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

async function startServer() {
  const ok = await initializeRelayer();
  if (ok) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Relayer listening on port ${PORT}`));
  } else {
    console.error('Initialization failed. Exiting.');
    process.exit(1);
  }
}

startServer();
