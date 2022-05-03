require("dotenv").config();
const fs = require("fs");
const config = require("./config.json");
const bs58 = require("bs58");

const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  transfer,
} = require("@solana/spl-token");

const {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} = require("@solana/web3.js");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const secretKey = new Uint8Array(require("./config/secret_key"));
const whitelist = require(`./${process.env.WHITELIST_PATH}`);

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const payer = Keypair.fromSecretKey(secretKey);

console.log(bs58.encode(secretKey));

console.log("Connected to wallet:", payer.publicKey.toString());

(async () => {
  try {
    ////////////////////////////////////////////////////////
    //This is only devnet
    // const airdropSignature = await connection.requestAirdrop(
    //   payer.publicKey,
    //   LAMPORTS_PER_SOL
    // );

    // await connection.confirmTransaction(airdropSignature);

    let valance = await connection.getBalance(payer.publicKey);
    console.log("Wallet balance is:", valance);

    //////////////////////////////////////////////////
    const mint = await createMint(connection, payer, payer.publicKey, null, 0);

    console.log("Created sql-token:", mint.toBase58());

    fs.writeFileSync(
      `${process.env.SPLTOKEN}`,
      `module.exports="${mint.toBase58()}"`
    );

    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      payer.publicKey
    );

    console.log("Created account for mint:", tokenAccount.address.toString());

    await mintTo(
      connection,
      payer,
      mint,
      tokenAccount.address,
      payer.publicKey,
      whitelist.length
    );

    const tokenAccountInfo = await getAccount(connection, tokenAccount.address);

    console.log(
      "Minted spl-token for presale:",
      tokenAccountInfo.amount.toString()
    );

    const tokenAccountsTo = await Promise.all(
      whitelist.map((address) =>
        getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          new PublicKey(address)
        )
      )
    );

    const distributeResult = await Promise.all(
      tokenAccountsTo.map((account) => {
        return transfer(
          connection,
          payer,
          tokenAccount.address,
          account.address,
          payer.publicKey,
          1
        );
      })
    );

    const tokenAccountInfos = await Promise.all(
      tokenAccountsTo.map((account) => getAccount(connection, account.address))
    );

    tokenAccountInfos.map((accountInfo) =>
      console.log(accountInfo.amount.toString())
    );

    /// Setting config data
    config.price = parseFloat(process.env.MINT_PRICE);
    config.number = 1;
    config.endSettings.endSettingType.amount = true;
    config.endSettings.value = 1;
    config.solTreasuryAccount = process.env.TREASURY_ACCOUNT;
    config.whitelistMintSettings.mint = mint.toBase58();
    config.whitelistMintSettings.discountPrice = parseFloat(
      process.env.WHITELIST_PRICE
    );

    config.hiddenSettings.name = process.env.NFT_NAME;
    config.hiddenSettings.symbol = process.env.NFT_SYMBOL;
    config.hiddenSettings.uri = process.env.DEFAULT_METADATA_URL;
    config.hiddenSettings.hash = process.env.DEFAULT_HASH;

    await fs.writeFileSync("config_pre.json", JSON.stringify(config), "utf8");
    config.number = parseInt(process.env.MINT_NUMBER);
    config.endSettings.value = parseInt(process.env.MINT_NUMBER);
    await fs.writeFileSync("config_ultra.json", JSON.stringify(config), "utf8");

    let cmd =
      "ts-node ~/metaplex/js/packages/cli/src/candy-machine-v2-cli.ts verify_assets ./assets_default";

    let result = await runCommand(cmd);

    console.log(result);
  } catch (err) {
    console.log(err);
  }
})();

async function runCommand(command) {
  const { stdout, stderr, error } = await exec(command);
  if (stderr) {
    console.error("stderr:", stderr);
  }
  if (error) {
    console.error("error:", error);
  }
  return stdout;
}
