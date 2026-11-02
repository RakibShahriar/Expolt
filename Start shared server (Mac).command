#!/bin/bash
# Double-click to run the Noor Autos shared server on this Mac.
cd "$(dirname "$0")"
python3 server.py
echo
read -n 1 -s -r -p "The server has stopped. Press any key to close this window."
