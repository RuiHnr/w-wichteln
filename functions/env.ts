export interface Env {
  DB: D1Database;
  /**
   * The R2 bucket holding Group Pictures and Participant Pictures. Optional on purpose: where
   * the binding is missing, pictures are unavailable (503 on upload) but nothing else breaks.
   */
  PICTURES?: R2Bucket;
}
