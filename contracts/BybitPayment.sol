// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IUSDC {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
}

contract BybitPayment {
    address public immutable usdc;
    address public immutable receiver;
    address public immutable relayer;
    
    event PaymentProcessed(
        address indexed from,
        uint256 amount,
        uint256 nonce
    );

    mapping(address => uint256) public nonces;
    
    constructor(address _usdc, address _receiver, address _relayer) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_receiver != address(0), "Invalid receiver address");
        require(_relayer != address(0), "Invalid relayer address");
        
        usdc = _usdc;
        receiver = _receiver;
        relayer = _relayer;
    }

    function processPayment(
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external {
        require(msg.sender == relayer, "Only relayer can process payments");
        require(nonce == nonces[tx.origin], "Invalid nonce");
        
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                tx.origin,
                amount,
                nonce,
                address(this)
            )
        );
        
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(signature);
        address signer = ecrecover(ethSignedMessageHash, v, r, s);
        
        require(signer == tx.origin, "Invalid signature");
        
        nonces[tx.origin]++;
        
        require(
            IUSDC(usdc).transferFrom(tx.origin, receiver, amount),
            "Transfer failed"
        );
        
        emit PaymentProcessed(tx.origin, amount, nonce);
    }
    
    function getCurrentNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    function splitSignature(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
} 