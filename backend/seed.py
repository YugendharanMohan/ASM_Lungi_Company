"""Populate the database with plausible demo data.

    python seed.py            # add demo data, keep anything already there
    python seed.py --reset    # drop every table first

Safe to run repeatedly: sheds, looms and workers are matched by name, and
production entries skip any (worker, loom, date, shift) that already exists.
"""

import argparse
import random
from datetime import date, timedelta

from sqlalchemy import func, select

from app.db.session import Base, SessionLocal, engine
from app.models import (
    Dispatch,
    Loom,
    PickType,
    ProductionEntry,
    Shed,
    Shift,
    User,
    UserRole,
    Worker,
)

# Each pick carries its own piece rate. Real numbers are typed in per entry;
# these are only here so the demo data has believable rate bands to group by.
PICK_RATES = {
    PickType.P88X96: 9.50,
    PickType.P88X92: 9.00,
    PickType.P88X80: 8.50,
}

WORKER_NAMES = [
    "Murugan S", "Kavitha R", "Selvam P", "Lakshmi M", "Ramesh K",
    "Anitha V", "Perumal T", "Devi N", "Karthik R", "Meena S",
    "Sundar A", "Vasanthi K",
]
COMPANIES = [
    "Chennai Textiles Ltd",
    "Madurai Handloom Co",
    "Coimbatore Fabrics",
    "Erode Weaves Pvt Ltd",
]


def get_or_create_shed(db, name: str, location: str) -> Shed:
    shed = db.scalar(select(Shed).where(Shed.name == name))
    if shed is None:
        shed = Shed(name=name, location=location)
        db.add(shed)
        db.flush()
    return shed


def get_or_create_loom(db, number: str, shed: Shed) -> Loom:
    loom = db.scalar(
        select(Loom).where(Loom.shed_id == shed.id, Loom.loom_number == number)
    )
    if loom is None:
        loom = Loom(loom_number=number, shed_id=shed.id)
        db.add(loom)
        db.flush()
    return loom


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--reset", action="store_true", help="drop all tables before seeding"
    )
    parser.add_argument(
        "--days", type=int, default=30, help="days of production history"
    )
    args = parser.parse_args()

    if args.reset:
        confirm = input("Drop every table and lose all data? type 'yes': ")
        if confirm.strip().lower() != "yes":
            print("Aborted.")
            return
        Base.metadata.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)
    rng = random.Random(20260801)

    with SessionLocal() as db:
        sheds = [
            get_or_create_shed(db, "A", "North block"),
            get_or_create_shed(db, "B", "North block"),
            get_or_create_shed(db, "C", "South block"),
        ]

        looms: list[Loom] = []
        for shed in sheds:
            for n in range(1, 5):
                looms.append(get_or_create_loom(db, str(n), shed))

        workers: list[Worker] = []
        for i, name in enumerate(WORKER_NAMES):
            worker = db.scalar(select(Worker).where(Worker.name == name))
            if worker is None:
                worker = Worker(
                    name=name,
                    phone=f"9{rng.randint(100000000, 999999999)}",
                    shed_id=looms[i % len(looms)].shed_id,
                    rate_per_meter=PICK_RATES[PickType.P88X96],
                    is_active=i < len(WORKER_NAMES) - 1,
                )
                db.add(worker)
                db.flush()
            workers.append(worker)

        db.commit()

        # Production history
        today = date.today()
        added = 0
        for offset in range(args.days):
            day = today - timedelta(days=offset)
            if day.weekday() == 6:  # mill is closed on Sundays
                continue
            for index, worker in enumerate(workers):
                if not worker.is_active:
                    continue
                # Workers are not tied to a loom, but in practice they rotate
                # around two or three in their own shed rather than the whole
                # floor — a receipt covering twelve looms is not what a real
                # week looks like.
                pool = [looms[(index * 2 + k) % len(looms)] for k in range(3)]
                loom = pool[day.toordinal() % len(pool)]
                for shift in (Shift.DAY, Shift.NIGHT):
                    if shift is Shift.NIGHT and rng.random() < 0.55:
                        continue
                    exists = db.scalar(
                        select(ProductionEntry.id).where(
                            ProductionEntry.entry_date == day,
                            ProductionEntry.shift == shift,
                            ProductionEntry.worker_id == worker.id,
                            ProductionEntry.loom_id == loom.id,
                        )
                    )
                    if exists:
                        continue

                    meters = round(rng.uniform(35, 95), 2)
                    pick = rng.choice(list(PICK_RATES))
                    rate = PICK_RATES[pick]
                    db.add(
                        ProductionEntry(
                            entry_date=day,
                            shift=shift,
                            pick_type=pick,
                            worker_id=worker.id,
                            loom_id=loom.id,
                            meters=meters,
                            rate_per_meter=rate,
                            total_amount=round(meters * rate, 2),
                        )
                    )
                    added += 1
        db.commit()

        # Dispatches, roughly one per company per week
        dispatch_count = 0
        for week in range(args.days // 7 + 1):
            day = today - timedelta(days=week * 7 + rng.randint(0, 4))
            for company in rng.sample(COMPANIES, k=rng.randint(1, 3)):
                exists = db.scalar(
                    select(Dispatch.id).where(
                        Dispatch.dispatch_date == day,
                        Dispatch.company_name == company,
                    )
                )
                if exists:
                    continue
                db.add(
                    Dispatch(
                        company_name=company,
                        dispatch_date=day,
                        quantity=rng.randint(120, 900),
                        remarks=rng.choice(
                            ["", "Bulk order", "Repeat order", "Priority"]
                        ),
                    )
                )
                dispatch_count += 1
        db.commit()

        totals = {
            "sheds": db.scalar(select(func.count(Shed.id))),
            "looms": db.scalar(select(func.count(Loom.id))),
            "workers": db.scalar(select(func.count(Worker.id))),
            "production entries": db.scalar(
                select(func.count(ProductionEntry.id))
            ),
            "dispatches": db.scalar(select(func.count(Dispatch.id))),
            "users": db.scalar(select(func.count(User.id))),
        }

    print(f"Added {added} production entries, {dispatch_count} dispatches.")
    print("Database now holds:")
    for label, count in totals.items():
        print(f"  {count:>6}  {label}")
    if not totals["users"]:
        print(
            "\nNo user rows yet. Set BOOTSTRAP_ADMIN_EMAILS in .env to your "
            "own email so your first sign-in provisions an admin."
        )


if __name__ == "__main__":
    main()
