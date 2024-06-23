# 7677-playground

A playground to send ERC-4337 user operations using Pimlico's permissionless.js and Biconomy's
Paymaster Service and Safe Smart Account. The script mints a Biconomy NFT to the Smart Account.
Change the chain passed in the `paymasterERC7677Client` method calls to send user operations for
the desired network.

## How to run the repo

- First install all dependencies, using `yarn` or `npm` or `pnpm`
- Clone the `.env-exmaple` into a `.env` file
- Add your `PRIVATE_KEY`, `RPC_URL` `PRIVATE_KEY` and `BUNDLER_URL`
- To mint an NFT run the following command:

```bash
    yarn run paymaster
```
