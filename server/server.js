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
const CONTRACT_ADDRESS = "0xD2F05B5c0D9aBFf1Bd08eD9138C207cb15dFbf2A";
const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const MIN_MATIC_BALANCE = ethers.utils.parseEther("0.1"); // Минимальный баланс 0.1 MATIC

// Настройки газа
const GAS_SETTINGS = {
    maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"), // 30 gwei
    maxFeePerGas: ethers.utils.parseUnits("100", "gwei"), // 100 gwei
    gasLimit: 300000
};

// ABI для контрактов
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

        console.log('Initializing relayer...');
        relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, relayerWallet);
        usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, relayerWallet);

        const address = await relayerWallet.getAddress();
        console.log('Relayer address:', address);

        // Проверяем, что адрес релейера совпадает с контрактом
        console.log('Checking relayer address in contract...');
        const contractRelayer = await contract.relayer();
        console.log('Contract relayer address:', contractRelayer);
        if (contractRelayer.toLowerCase() !== address.toLowerCase()) {
            throw new Error(`Relayer address mismatch. Contract expects: ${contractRelayer}`);
        }
        console.log('Relayer address verified');

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
        console.log('Checking USDC allowance...');
        const allowance = await usdc.allowance(address, CONTRACT_ADDRESS);
        console.log('Current USDC allowance:', ethers.utils.formatUnits(allowance, 6));
        
        if (allowance.eq(0)) {
            console.log('Approving USDC for contract...');
            const approveTx = await usdc.approve(
                CONTRACT_ADDRESS, 
                ethers.constants.MaxUint256,
                GAS_SETTINGS
            );
            console.log('Approve transaction sent:', approveTx.hash);
            console.log('Waiting for approval confirmation...');
            await approveTx.wait();
            console.log('USDC approved for contract');
        } else {
            console.log('USDC already approved');
        }

        console.log('Relayer initialization completed');
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

        const { 
            amount, 
            from,
            nonce,
            deadline,
            permitV,
            permitR,
            permitS,
            paymentV,
            paymentR,
            paymentS
        } = req.body;
        
        // Проверяем, что все параметры предоставлены
        if (!amount || !from || !nonce || !deadline || 
            !permitV || !permitR || !permitS || 
            !paymentV || !paymentR || !paymentS) {
            throw new Error('Missing required parameters');
        }

        // Создаем домен для EIP-712 (для проверки подписи платежа)
        const domain = {
            name: await contract.name(),
            version: await contract.version(),
            chainId: (await provider.getNetwork()).chainId,
            verifyingContract: CONTRACT_ADDRESS
        };

        // Определяем типы для EIP-712
        const types = {
            PaymentMessage: [
                { name: "from", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "verifyingContract", type: "address" }
            ]
        };

        // Создаем значение для проверки
        const value = {
            from: from,
            amount: amount,
            nonce: nonce,
            verifyingContract: CONTRACT_ADDRESS
        };

        // Восстанавливаем адрес из подписи платежа
        const recoveredAddress = ethers.utils.verifyTypedData(
            domain,
            types,
            value,
            { r: paymentR, s: paymentS, v: paymentV }
        );

        console.log('Payment signature verification:', {
            expectedSigner: from,
            recoveredAddress: recoveredAddress,
            domain,
            types,
            value
        });

        if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
            throw new Error('Invalid payment signature');
        }

        // Создаем подписи в формате, который ожидает контракт (65 байт)
        const paymentSignature = ethers.utils.concat([
            ethers.utils.arrayify(paymentR),
            ethers.utils.arrayify(paymentS),
            [paymentV]
        ]);

        // Проверяем баланс MATIC перед отправкой
        const maticBalance = await provider.getBalance(relayerWallet.address);
        if (maticBalance.lt(MIN_MATIC_BALANCE)) {
            throw new Error(`Insufficient relayer MATIC balance: ${ethers.utils.formatEther(maticBalance)} MATIC`);
        }

        // Отправляем транзакцию с permit
        const tx = await contract.processPaymentWithPermit(
            from,
            amount,
            nonce,
            deadline,
            permitV,
            permitR,
            permitS,
            paymentSignature,
            GAS_SETTINGS
        );

        console.log('Transaction sent:', tx.hash);
        const receipt = await tx.wait();
        console.log('Transaction confirmed');

        res.json({
            success: true,
            txHash: tx.hash
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