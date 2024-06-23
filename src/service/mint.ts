import * as dotenv from "dotenv";
import { ENTRYPOINT_ADDRESS_V06, UserOperation } from "permissionless";
import {
  SafeSmartAccount,
  signerToSafeSmartAccount,
} from "permissionless/accounts";
import {
  createPimlicoBundlerClient,
  PimlicoBundlerClient,
} from "permissionless/clients/pimlico";
import {
  Chain,
  createClient,
  createPublicClient,
  encodeFunctionData,
  Hex,
  http,
  parseAbi,
  PrivateKeyAccount,
  PublicClient,
  Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { paymasterActionsEip7677 } from "permissionless/experimental";
import { polygon } from "viem/chains";

// Load environment variables from the .env file
dotenv.config({ path: ".env" });

// Define constants from environment variables
const RPC_URL = process.env.RPC_URL;
const PAYMASTER_URL = process.env.PAYMASTER_URL;
const BUNDLER_URL = process.env.BUNDLER_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
const nftAddress = "0x1758f42Af7026fBbB559Dc60EcE0De3ef81f665e";
const DUMMY_GAS_LIMIT = 1000000n;

// Create and initialize public, paymaster, and bundler clients
const createClients = () => {
  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  });

  const paymasterERC7677Client = createClient({
    transport: http(PAYMASTER_URL),
  }).extend(paymasterActionsEip7677(ENTRYPOINT_ADDRESS_V06));

  const bundlerClient = createPimlicoBundlerClient({
    transport: http(BUNDLER_URL),
    entryPoint: ENTRYPOINT_ADDRESS_V06,
  });

  return { publicClient, paymasterERC7677Client, bundlerClient };
};

// Retrieve the Safe smart account associated with the given signer
const getSafeAccount = async (
  publicClient: PublicClient,
  signer: PrivateKeyAccount,
) => {
  return await signerToSafeSmartAccount(publicClient, {
    entryPoint: ENTRYPOINT_ADDRESS_V06,
    signer: signer,
    safeVersion: "1.4.1",
  });
};

// Check if the account's bytecode is deployed and get the initialization code if needed
const getInitCodeIfNeeded = async (
  publicClient: PublicClient,
  safeAccount: SafeSmartAccount<
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    Transport,
    Chain | undefined
  >,
) => {
  const byteCode = await publicClient.getBytecode({
    address: safeAccount.address,
  });
  return byteCode === undefined
    ? await safeAccount.getInitCode()
    : ("0x" as `0x${string}`);
};

// Create the call data for minting the NFT
const getMintCallData = async (
  safeAccount: SafeSmartAccount<
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    Transport,
    Chain | undefined
  >,
) => {
  const parsedAbi = parseAbi(["function safeMint(address _to)"]);
  const nftData = encodeFunctionData({
    abi: parsedAbi,
    functionName: "safeMint",
    args: [safeAccount.address],
  });

  return await safeAccount.encodeCallData({
    to: nftAddress,
    value: 0n,
    data: nftData,
  });
};

// Get the current gas prices for the user operation
const getUserOperationGasPrices = async (
  bundlerClient: PimlicoBundlerClient<"0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789">,
) => {
  const { maxFeePerGas, maxPriorityFeePerGas } = (
    await bundlerClient.getUserOperationGasPrice()
  ).fast;
  return { maxFeePerGas, maxPriorityFeePerGas };
};

// Prepare the user operation with the necessary details
const prepareUserOperation = async (
  safeAccount: SafeSmartAccount<
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    Transport,
    Chain | undefined
  >,
  paymasterERC7677Client: any,
  bundlerClient: PimlicoBundlerClient<"0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789">,
  initCode: `0x${string}`,
  callData: `0x${string}`,
) => {
  const sender = safeAccount.address;
  const nonce = await safeAccount.getNonce();
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await getUserOperationGasPrices(bundlerClient);

  const stubPaymasterAndData = (
    await paymasterERC7677Client.getPaymasterStubData({
      userOperation: {
        sender,
        nonce,
        initCode,
        callData,
        maxFeePerGas,
        maxPriorityFeePerGas,
        preVerificationGas: DUMMY_GAS_LIMIT,
        callGasLimit: DUMMY_GAS_LIMIT,
        verificationGasLimit: DUMMY_GAS_LIMIT,
      },
      chain: polygon, // change the chain if required
    })
  ).paymasterAndData;

  const dummySignature = await safeAccount.getDummySignature({
    sender,
    nonce,
    initCode,
    callData,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymasterAndData: stubPaymasterAndData,
    preVerificationGas: DUMMY_GAS_LIMIT,
    callGasLimit: DUMMY_GAS_LIMIT,
    verificationGasLimit: DUMMY_GAS_LIMIT,
    signature: "0x",
  });

  const { callGasLimit, verificationGasLimit, preVerificationGas } =
    await bundlerClient.estimateUserOperationGas({
      userOperation: {
        sender,
        nonce,
        initCode,
        callData,
        maxFeePerGas,
        maxPriorityFeePerGas,
        paymasterAndData: stubPaymasterAndData,
        signature: dummySignature,
      },
    });

  const { paymasterAndData } = await paymasterERC7677Client.getPaymasterData({
    userOperation: {
      sender,
      nonce,
      initCode,
      callData,
      maxFeePerGas,
      maxPriorityFeePerGas,
      callGasLimit,
      verificationGasLimit,
      preVerificationGas,
      paymasterAndData: stubPaymasterAndData,
      signature: dummySignature,
    },
    chain: polygon, // change the chain if required
  });

  const signature = await safeAccount.signUserOperation({
    sender,
    nonce,
    initCode,
    callData,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymasterAndData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    signature: dummySignature,
  });

  return {
    sender,
    nonce,
    initCode,
    callData,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymasterAndData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    signature,
  };
};

// Send the prepared user operation and log the transaction hash
const sendAndWaitForUserOperation = async (
  bundlerClient: PimlicoBundlerClient<"0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789">,
  userOperation: UserOperation<"v0.6">,
) => {
  const userOpHash = await bundlerClient.sendUserOperation({ userOperation });
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log(`Transaction Hash: ${receipt.receipt.transactionHash}`);
};

// Main function to mint the NFT
export const mint = async () => {
  try {
    // Create necessary clients
    const { publicClient, paymasterERC7677Client, bundlerClient } =
      createClients();

    // Create signer from private key
    const signer = privateKeyToAccount(PRIVATE_KEY);

    // Get the safe account associated with the signer
    const safeAccount = await getSafeAccount(publicClient, signer);

    // Get the init code if needed
    const initCode = await getInitCodeIfNeeded(publicClient, safeAccount);

    // Get the call data for minting the NFT
    const callData = await getMintCallData(safeAccount);

    // Prepare the user operation
    const userOperation = await prepareUserOperation(
      safeAccount,
      paymasterERC7677Client,
      bundlerClient,
      initCode,
      callData,
    );

    // Send and wait for the user operation confirmation
    await sendAndWaitForUserOperation(bundlerClient, userOperation);
  } catch (error) {
    console.error(`Error in minting NFT: ${error}`);
  }
};

// Execute the mint function
mint();
