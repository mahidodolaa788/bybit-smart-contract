const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Конфигурация для Polygon
const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const CONTRACT_ADDRESS = "0xD26266c4451b1E3c824FCd65e76272997BADA76B";
const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const MIN_MATIC_BALANCE = ethers.utils.parseEther("0.1"); // Минимальный баланс 0.1 MATIC

// ABI для контрактов
const CONTRACT_ABI = [
    "function sendPaymentWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external returns (bool)",
    "function forwardPayment(address from, uint256 amount) external returns (bool)",
    "function receiverAddress() external view returns (address)",
    "function relayerAddress() external view returns (address)"
];

const USDC_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)"
];

// Создаем провайдер и кошелек для релейера
const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
let relayerWallet;
let contract;
let usdc;

// Функция инициализации релейера
async function initializeRelayer() {
    try {
        if (!RELAYER_PRIVATE_KEY) {
            throw new Error('RELAYER_PRIVATE_KEY not set in environment');
        }

        relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, relayerWallet);
        usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, relayerWallet);

        const address = await relayerWallet.getAddress();
        console.log('Relayer address:', address);

        // Проверяем, что адрес релейера совпадает с контрактом
        const contractRelayer = await contract.relayerAddress();
        if (contractRelayer.toLowerCase() !== address.toLowerCase()) {
            throw new Error(`Relayer address mismatch. Contract expects: ${contractRelayer}`);
        }

        // Проверяем баланс MATIC
        const maticBalance = await provider.getBalance(address);
        console.log('Relayer MATIC balance:', ethers.utils.formatEther(maticBalance));

        // Проверяем баланс USDC
        const usdcBalance = await usdc.balanceOf(address);
        console.log('Relayer USDC balance:', ethers.utils.formatUnits(usdcBalance, 6));

        if (maticBalance.lt(MIN_MATIC_BALANCE)) {
            throw new Error(`Insufficient MATIC balance. Required: 0.1 MATIC, Available: ${ethers.utils.formatEther(maticBalance)} MATIC`);
        }

        // Проверяем разрешение USDC для контракта
        const allowance = await usdc.allowance(address, CONTRACT_ADDRESS);
        if (allowance.eq(0)) {
            console.log('Approving USDC for contract...');
            const approveTx = await usdc.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256);
            await approveTx.wait();
            console.log('USDC approved for contract');
        }

        return true;
    } catch (error) {
        console.error('Relayer initialization error:', error);
        return false;
    }
}

app.post('/relay', async (req, res) => {
    try {
        if (!relayerWallet || !contract) {
            throw new Error('Relayer not initialized');
        }

        const { amount, deadline, v, r, s, from } = req.body;
        
        // Проверяем, что все параметры предоставлены
        if (!amount || !deadline || v === undefined || !r || !s || !from) {
            throw new Error('Missing required parameters');
        }

        // Проверяем, что deadline не истек
        const currentTime = Math.floor(Date.now() / 1000);
        if (deadline <= currentTime) {
            throw new Error('Permit deadline has expired');
        }

        console.log('Relaying transaction with params:', {
            from,
            amount,
            deadline,
            v,
            r,
            s
        });

        // Проверяем баланс MATIC перед отправкой
        const maticBalance = await provider.getBalance(relayerWallet.address);
        if (maticBalance.lt(MIN_MATIC_BALANCE)) {
            throw new Error(`Insufficient relayer MATIC balance: ${ethers.utils.formatEther(maticBalance)} MATIC`);
        }

        // Получаем USDC от пользователя
        const tx1 = await contract.sendPaymentWithPermit(
            amount,
            deadline,
            v,
            r,
            s,
            {
                gasLimit: 300000
            }
        );

        console.log('Initial transaction sent:', tx1.hash);
        await tx1.wait();
        console.log('Initial transaction confirmed');

        // Проверяем, что USDC получены
        const relayerBalance = await usdc.balanceOf(relayerWallet.address);
        if (relayerBalance.lt(amount)) {
            throw new Error(`Relayer did not receive USDC. Balance: ${ethers.utils.formatUnits(relayerBalance, 6)}`);
        }

        // Пересылаем USDC получателю
        const tx2 = await contract.forwardPayment(
            from,
            amount,
            {
                gasLimit: 300000
            }
        );

        console.log('Forward transaction sent:', tx2.hash);
        const receipt2 = await tx2.wait();
        console.log('Forward transaction confirmed');

        res.json({
            success: true,
            initialTx: tx1.hash,
            forwardTx: tx2.hash
        });
    } catch (error) {
        console.error('Relay error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Эндпоинт для проверки статуса релейера
app.get('/status', async (req, res) => {
    try {
        if (!relayerWallet) {
            throw new Error('Relayer not initialized');
        }

        const maticBalance = await provider.getBalance(relayerWallet.address);
        const usdcBalance = await usdc.balanceOf(relayerWallet.address);
        
        res.json({
            status: 'active',
            address: relayerWallet.address,
            maticBalance: ethers.utils.formatEther(maticBalance),
            usdcBalance: ethers.utils.formatUnits(usdcBalance, 6)
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Запускаем сервер только после успешной инициализации релейера
async function startServer() {
    const initialized = await initializeRelayer();
    if (initialized) {
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Relayer server running on port ${PORT}`);
        });
    } else {
        console.error('Failed to initialize relayer. Server not started.');
        process.exit(1);
    }
}

startServer(); 