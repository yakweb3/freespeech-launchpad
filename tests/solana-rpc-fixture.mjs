// Local deterministic RPC fixture. Never used by application code or production.
import { createServer } from "node:http";
import { Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
let state = {
  balance: "1000000",
  finalized: false,
  fail: false,
  unavailable: false,
  height: 100,
  failSendOnce: false,
};
const transactions = new Map();
createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw || "{}");
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/control") {
    Object.assign(state, body);
    res.end("{}");
    return;
  }
  if (state.unavailable) {
    res.statusCode = 503;
    res.end("{}");
    return;
  }
  let result;
  switch (body.method) {
    case "getGenesisHash":
      result = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
      break;
    case "getLatestBlockhash":
      result = {
        context: { slot: 1 },
        value: {
          blockhash: Keypair.generate().publicKey.toBase58(),
          lastValidBlockHeight: 200,
        },
      };
      break;
    case "getFeeForMessage":
      result = { value: 10000 };
      break;
    case "getBlockHeight":
      result = state.height;
      break;
    case "sendTransaction": {
      if (state.failSendOnce) { state.failSendOnce = false; res.statusCode = 503; res.end("{}"); return; }
      const tx = Transaction.from(Buffer.from(body.params[0], "base64"));
      if (!tx.verifySignatures()) throw new Error("Invalid fixture tx");
      result = bs58.encode(tx.signature);
      transactions.set(result, body.params[0]);
      break;
    }
    case "getTransaction":
      result =
        state.finalized && transactions.has(body.params[0])
          ? {
              meta: {
                err: state.fail ? { InstructionError: [1, "failure"] } : null,
              },
              transaction: [transactions.get(body.params[0]), "base64"],
            }
          : null;
      break;
    case "getTokenAccountsByOwner":
      result = {
        context: { slot: 1 },
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    owner: body.params[0],
                    mint: body.params[1].mint,
                    tokenAmount: { amount: state.balance, decimals: 6 },
                  },
                },
              },
            },
          },
        ],
      };
      break;
    default:
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          error: { message: "Unsupported fixture method: " + body.method },
        }),
      );
      return;
  }
  res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
}).listen(5176, "127.0.0.1", () => console.log("RPC fixture ready"));
