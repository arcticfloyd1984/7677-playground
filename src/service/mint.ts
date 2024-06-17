import * as dotenv from 'dotenv';
import { ENTRYPOINT_ADDRESS_V06, createSmartAccountClient } from "permissionless"
import { signerToSafeSmartAccount } from "permissionless/accounts"
import {
    createPimlicoBundlerClient,
	createPimlicoPaymasterClient,
} from "permissionless/clients/pimlico"
import { createPublicClient, encodeFunctionData, getContract, Hex, http, parseAbi, parseEther } from "viem"
import { base } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
dotenv.config({ path: '.env' });

export const mint = async () => {
    try {
        const publicClient = createPublicClient({
            transport: http(process.env.RPC_URL),
        });
         
        const paymasterClient = createPimlicoPaymasterClient({
            transport: http(process.env.PAYMASTER_URL),
            entryPoint: ENTRYPOINT_ADDRESS_V06,
        });

        const pimlicoBundlerClient = createPimlicoBundlerClient({
            transport: http(process.env.BUNDLER_URL),
            entryPoint: ENTRYPOINT_ADDRESS_V06,
        });

        const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);

        const safeAccount = await signerToSafeSmartAccount(publicClient, {
            entryPoint: ENTRYPOINT_ADDRESS_V06,
            signer: signer,
            safeVersion: "1.4.1",
        });

        const smartAccountClient = createSmartAccountClient({
            account: safeAccount,
            entryPoint: ENTRYPOINT_ADDRESS_V06,
            chain: base,
            bundlerTransport: http(process.env.BUNDLER_URL),
            middleware: {
                sponsorUserOperation: paymasterClient.sponsorUserOperation, // optional
                gasPrice: async () => (await pimlicoBundlerClient.getUserOperationGasPrice()).fast, // if using pimlico bundler
            },
        })

        const nftAddress = "0x39aDa030A6B753e4eFdbEe9CCbD808c7159945e8"
        const parsedAbi = parseAbi(["function safeMint(address _to)"])
        const nftData = encodeFunctionData({
          abi: parsedAbi,
          functionName: "safeMint",
          args: [safeAccount.address]
        })

        const txHash = await smartAccountClient.sendTransactions({
            transactions: [
                {
                    to: nftAddress,
                    value: 0n,
                    data: nftData
                },
                {
                    to: nftAddress,
                    value: 0n,
                    data: nftData
                },
            ]
        });

        console.log(`txHash: ${txHash}`);
         
    } catch (error) {
        console.error(`Error in minting NFT: ${error}`);
    }
}

mint();