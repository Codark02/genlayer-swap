import { createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";

export type GlClient = ReturnType<typeof createClient>;

export async function waitTxAccepted(client: GlClient, hash: string) {
  await client.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.ACCEPTED,
    retries: 55,
    interval: 4000,
  });
}
