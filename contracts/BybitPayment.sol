// SPDX-License-Identifier: MIT
// версия для компилятора. Последняя стабильная - 0.8.30
pragma solidity ^0.8.17;

// TODO: взять интерфейс из OpenZeppelin
interface IUSDC {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract BybitPayment {
    address public immutable usdc;
    address public immutable receiver;
    address public immutable relayer;
    
    string public constant name = "BybitPayment";
    string public constant version = "1";
    
    // EIP-712 typehash - это хеш строки с описанием структуры данных, которую
    // кто-то должен подписать.
    // bytes32 - тип переменной-константы (32 байта)
    // public constant - видна извне и не изменяется
    // keccak256 -  функция хеширования, как SHA-3 (Ethereum использует именно её)
    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        // TODO: @openzeppelin/contracts имеет поддержку EIP712, где уже предусмотрено безопасное формирование typehash'ей.
        "PaymentMessage(address from,uint256 amount,uint256 nonce,address verifyingContract)"
    );
    
    // EIP-712 сепаратор - шех структуры, состоящий из name, version, chainId, veryfyingContract,
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    event PaymentProcessed(
        address indexed from,
        uint256 amount,
        uint256 nonce
    );

    // Debug events
    event Debug_InputData(
        address from,
        uint256 amount,
        uint256 nonce,
        bytes signature,
        address msgSender
    );
    event Debug_RawSignature(bytes signature);
    event Debug_StructHash(bytes32 structHash, address from, uint256 amount, uint256 nonce, address verifyingContract);
    event Debug_Hash(bytes32 hash, bytes32 domainSeparator, bytes32 structHash);
    event Debug_Signature(uint8 v, bytes32 r, bytes32 s);
    event Debug_Signer(address recovered, address expected);
    event Debug_NonceCheck(uint256 providedNonce, uint256 currentNonce, address user);
    event Debug_DomainSeparator(
        bytes32 domainSeparator,
        string name,
        string version,
        uint256 chainId,
        address verifyingContract
    );
    event Debug_USDCCheck(
        address indexed user,
        address indexed spender,
        uint256 balance,
        uint256 allowance,
        uint256 requiredAmount
    );

    event Debug_USDCTransfer(
        address indexed from,
        address indexed to,
        uint256 amount,
        bool success
    );

    event Debug_USDCBalances(
        address indexed from,
        address indexed to,
        uint256 senderBalanceBefore,
        uint256 receiverBalanceBefore,
        uint256 senderBalanceAfter,
        uint256 receiverBalanceAfter
    );

    mapping(address => uint256) public nonces;
    
    constructor(address _usdc, address _receiver, address _relayer) {
        // проверки на то, что адреса не равны нулю
        require(_usdc != address(0), "Invalid USDC address");
        require(_receiver != address(0), "Invalid receiver address");
        require(_relayer != address(0), "Invalid relayer address");
        
        usdc = _usdc;
        receiver = _receiver;
        relayer = _relayer;
        
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                block.chainid,
                address(this)
            )
        );

        // Log domain separator details
        emit Debug_DomainSeparator(
            DOMAIN_SEPARATOR,
            name,
            version,
            block.chainid,
            address(this)
        );
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

        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "Invalid signature v value");
    }

    function processPayment(
        address from,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) public {
        // Log input data
        emit Debug_InputData(from, amount, nonce, signature, msg.sender);
        
        require(msg.sender == relayer, "Only relayer can process payments");
        
        // Log raw signature
        emit Debug_RawSignature(signature);
        
        // Log nonce check
        emit Debug_NonceCheck(nonce, nonces[from], from);
        require(nonce == nonces[from], "Invalid nonce");
        
        bytes32 structHash = keccak256(
            abi.encode(
                PAYMENT_TYPEHASH,
                from,
                amount,
                nonce,
                address(this)  // verifyingContract
            )
        );
        
        // Log struct hash and its components
        emit Debug_StructHash(structHash, from, amount, nonce, address(this));
        
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                structHash
            )
        );
        
        // Log final hash
        emit Debug_Hash(hash, DOMAIN_SEPARATOR, structHash);
        
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(signature);
        
        // Log signature components
        emit Debug_Signature(v, r, s);
        
        address signer = ecrecover(hash, v, r, s);
        
        // Log recovered signer
        emit Debug_Signer(signer, from);
        
        require(signer != address(0), "Invalid signature");
        require(signer == from, "Invalid signer");
        
        // Проверяем баланс и разрешение USDC
        uint256 senderBalanceBefore = IUSDC(usdc).balanceOf(from);
        uint256 receiverBalanceBefore = IUSDC(usdc).balanceOf(receiver);
        uint256 allowed = IUSDC(usdc).allowance(from, address(this));
        
        emit Debug_USDCCheck(
            from,
            address(this),
            senderBalanceBefore,
            allowed,
            amount
        );
        
        require(senderBalanceBefore >= amount, "Insufficient USDC balance");
        require(allowed >= amount, "Insufficient USDC allowance");
        
        nonces[from]++;
        
        bool success = IUSDC(usdc).transferFrom(from, receiver, amount);
        emit Debug_USDCTransfer(from, receiver, amount, success);
        require(success, "USDC transfer failed");

        // Проверяем балансы после трансфера
        uint256 senderBalanceAfter = IUSDC(usdc).balanceOf(from);
        uint256 receiverBalanceAfter = IUSDC(usdc).balanceOf(receiver);
        
        emit Debug_USDCBalances(
            from,
            receiver,
            senderBalanceBefore,
            receiverBalanceBefore,
            senderBalanceAfter,
            receiverBalanceAfter
        );
        
        emit PaymentProcessed(from, amount, nonce);
    }

    function processPaymentWithPermit(
        address from,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS,
        bytes memory paymentSignature
    ) external {
        // Вызываем permit для получения разрешения на списание USDC
        IUSDC(usdc).permit(
            from,
            address(this),
            amount,
            deadline,
            permitV,
            permitR,
            permitS
        );
        
        // Вызываем обычную функцию processPayment
        processPayment(from, amount, nonce, paymentSignature);
    }
} 