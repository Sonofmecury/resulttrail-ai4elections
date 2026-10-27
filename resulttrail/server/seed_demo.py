"""Create fictional demo accounts after an explicit AEGIS_DEMO=1 opt-in."""

import os

from .core import DEFAULT_INSTANCE, connection, init_db, password_hash


def main() -> None:
    if os.getenv("AEGIS_DEMO") != "1":
        raise SystemExit("Set AEGIS_DEMO=1 to seed fictional demo accounts")
    path = DEFAULT_INSTANCE / "aegis.sqlite"
    DEFAULT_INSTANCE.mkdir(parents=True, exist_ok=True)
    init_db(path)
    with connection(path) as db:
        for alias, role in (("reporter", "reporter"), ("reviewer", "reviewer")):
            db.execute(
                "INSERT OR IGNORE INTO account(alias,password_hash,role,tenant) VALUES(?,?,?,?)",
                (alias, password_hash("demo-only-change-me"), role, "synthetic-team"),
            )
    print("Fictional accounts ready: reporter and reviewer / demo-only-change-me")


if __name__ == "__main__":
    main()
