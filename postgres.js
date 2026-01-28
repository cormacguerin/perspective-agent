/*
 * Wrapper for Postgres.
 */

import dotenv from "dotenv";
import * as pg from "pg";
const {Pool} = pg.default;
import fs from "fs";

class Postgres {

    constructor (db) {

        if (db) {

            if (db.database === process.env.DATABASE) {

                this.pool = new Pool({
                    "user": "postgres",
                    "host": "localhost",
                    "database": process.env.DATABASE,
                    "password": process.env.DATABASE_PASSWORD,
                    "port": 5432,
                    "idleTimeoutMillis": 60000
                });

            } else {

                this.pool = new Pool({
                    "user": "postgres",
                    "host": "localhost",
                    "database": db.database,
                    "password": db.password,
                    "port": 5432
                });

            }

            this.pool.on(
                "error",
                (err, client) => {

                    console.error(
                        "Unexpected error on idle client",
                        err
                    );
                    process.exit(-1);

                }
            );

            this.pool.query(
                "SELECT NOW()",
                (err, res) => {

                    console.log(
                        err,
                        res
                    );

                }
            );

            this.logger = fs.createWriteStream(
                "postgres_write.log",
                {
                    "flags": "a" // 'a' means appending (old data will be preserved)
                }
            );

        }

    }

    execute (statement, values, callback) {

        (async () => {

            const client = await this.pool.connect();
            try {

                const reply = await client.query(
                    statement,
                    values
                );
                this.logger.write(`${statement}\n`);
                //console.log("reply");
                //console.log(reply);
                callback(
                    null,
                    reply.rows
                );

            } finally {

                client.release();

            }

        })().catch((e) => {

            console.log(e.stack);
            callback(e);

        });

    }

    /*
     * Same as above, but in row mode array
     */
    raexecute (statement, values, callback) {

        const query = {
            "text": statement,
            values,
            "rowMode": "array"
        };
        (async () => {

            const client = await this.pool.connect();
            try {

                const reply = await client.query(query);
                this.logger.write(`${statement}\n`);
                callback(
                    null,
                    reply.rows
                );

            } finally {

                client.release();

            }

        })().catch((e) => {

            console.log(e.stack);
            callback(e);

        });

    }

    batch_execute (statement, values, callback) {

        (async () => {

            this.logger.write(`${statement}\n`);
            const client = await this.pool.connect();
            try {

                await client.query("BEGIN");
                const promises = [],
                    promisePush = async function () {

                        var it = new Date().getTime();
                        for (const v in values) {

                            for (const x in values[v]) {

                                /*
                                 * Console.log(values[v][x]);
                                 * Set empty stuff to null
                                 */
                                if (values[v][x] === "") {

                                    values[v][x] = null;

                                }

                            }

                            //console.log('values')
                            //console.log(values)

                            promises.push(client.query(
                                statement,
                                Object.values(values[v])
                            ));

                        }
                        const et = new Date().getTime(),
                            totaltime = et - it;
                        console.log(`promises pushed in ${totaltime}ms`);
                        var it = new Date().getTime();
                        await Promise.all(promises).
                            then((r) => {

                                console.log("primises done, commit");
                                client.query("COMMIT");
                                //client.release();
                                const et = new Date().getTime(),
                                    totaltime = et - it;
                                console.log(`promises finished in ${totaltime}ms`);
                                callback(
                                    null,
                                    r
                                );

                            }).
                            catch((e) => {

                                console.log("error pushing statements");
                                console.log(e);
                                client.query("ROLLBACK");
                                //client.release();
                                callback(e);

                            });

                    };
                promisePush();

            } catch (e) {

                console.log("error in rollback");
                console.log(e);
                await client.query("ROLLBACK");

            } finally {

                console.log("finally");
                client.release();

            }

        })().catch((e) => {

            console.log(e.stack);
            callback(e);

        });

    }

    end () {

        this.pool.end();

    }

    async createSchema() {

        const sql = `
            CREATE TABLE IF NOT EXISTS corpus (
                id SERIAL PRIMARY KEY,
                agent VARCHAR(64) NOT NULL,
                type VARCHAR(32) NOT NULL,
                data TEXT,
                summary TEXT,
                owner VARCHaR(64),
                last_fed DATE,
                last_processed DATE,
                UNIQUE (agent, owner)
            );
        `;

        const client = await this.pool.connect();
        try {
            await client.query(sql);
            console.log("create schema");
        } finally {
            client.release();
        }

    }

    async upsertCorpus({ agent, type, data, summary, owner }) {
        const sql = `
            INSERT INTO corpus (agent, type, data, summary, owner, last_fed, last_processed)
            VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE)
            ON CONFLICT (agent, owner)
            DO UPDATE SET
                data = EXCLUDED.data,
                type = EXCLUDED.type,
                last_processed = CURRENT_DATE
            RETURNING id;
        `;

        const client = await this.pool.connect();
        try {
            const res = await client.query(sql, [agent, type, data, summary, owner]);
            return res.rows[0].id;
        } finally {
            client.release();
        }
    }

    setCollectionEnabled (uid, nft_address, enabled, callback) {

        const query = "UPDATE collections SET enabled = $3, promoted = $3 WHERE nft_address = $2 AND user_id = $1 RETURNING enabled";
        this.execute(
            query,
            [
                uid,
                nft_address,
                enabled
            ],
            (e, r) => {

                callback(
                    e,
                    r
                );

            }
        );

    }

}

// module.exports = Postgres;
export default Postgres;
