import { Eip1193Provider } from "ethers";

export {};

declare global {
  interface Window {
    ethereum?: Ethereum;
    BinanceChain?: any;
    okxwallet?: any;
    rabby?: any;
    web3?: {
      currentProvider?: any;
    };
  }
}

interface Ethereum extends Eip1193Provider {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isBraveWallet?: boolean;
  isTaho?: boolean;
  isFrame?: boolean;
}
