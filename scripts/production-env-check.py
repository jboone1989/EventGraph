#!/usr/bin/env python3
"""Check deployment-local, secret-free configuration contracts before Compose can start.
Values and credentials never leave the host; only missing key names are reported.
"""
import argparse
import os
import re
import sys
from pathlib import Path

FEATURES = (
    "COLLECT_ENABLED", "MODEL_CALLS_ENABLED", "GRAPHITI_INGEST_ENABLED",
    "ADSENSE_VERIFICATION_ENABLED",
)
def read_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise ValueError(f"Missing environment file: {path}")
    result = {}
    for line in path.read_text().splitlines():
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        match = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)=(.*)$", value)
        if match:
            result[match.group(1)] = match.group(2).strip().strip('"').strip("'")
    return result

def errors(data: dict[str, str], role: str) -> list[str]:
    problems = []
    for key in FEATURES:
        if role == "production" and key not in data:
            problems.append(f"{key} must be explicit in the production .env")
        elif key in data and data[key] not in ("true", "false"):
            problems.append(f"{key} must be true or false")
    if data.get("GRAPHITI_INGEST_ENABLED") == "true" and data.get("MODEL_CALLS_ENABLED") != "true":
        problems.append("Graphiti ingestion requires enabled model calls")
    if role == "production" and data.get("AIHOT_ENVIRONMENT", "production") != "production":
        problems.append("AIHOT_ENVIRONMENT must be production on this host")
    return problems

def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("env_file", type=Path)
    cli.add_argument("--role", choices=["production", "development"], required=True)
    cli.add_argument("--compare", type=Path, help="Compare against versioned desired flags or another environment")
    cli.add_argument("--enforce", action="store_true", help="Fail when compared feature flags differ")
    args = cli.parse_args()
    primary = read_env(args.env_file)
    faults = errors(primary, args.role)
    if args.compare:
        secondary = read_env(args.compare)
        for key in FEATURES:
            if primary.get(key) != secondary.get(key):
                report=f"DIFF {key}: {args.role}={primary.get(key, 'unset')}, desired={secondary.get(key, 'unset')}"
                print(report)
                if args.enforce:
                    faults.append(report)
    if faults:
        for issue in faults:
            print("INVALID:", issue, file=sys.stderr)
        return 1
    print(f"OK: {args.role} feature flags explicit/consistent")
    return 0

if __name__ == "__main__":
    sys.exit(main())
