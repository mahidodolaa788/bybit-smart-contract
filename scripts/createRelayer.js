const { ethers } = require('ethers');

// Создаем новый кошелек
const wallet = ethers.Wallet.createRandom();

console.log('New Relayer Wallet:');
console.log('Address:', wallet.address);
console.log('Private Key:', wallet.privateKey);
console.log('\nINSTRUCTIONS:');
console.log('1. Save the private key in your .env file as RELAYER_PRIVATE_KEY');
console.log('2. Send some MATIC to this address for gas fees');
console.log('3. Restart the relayer server'); 