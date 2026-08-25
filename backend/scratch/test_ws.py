import asyncio
import json
import urllib.request
import websockets

async def test():
    # 1. Login
    req = urllib.request.Request(
        "http://localhost:8000/api/v1/auth/login",
        data=json.dumps({
            "email": "paymenttest@example.com",
            "password": "TestPay@2026!"
        }).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        token = res["data"]["access_token"]
        print("Login successful. Token length:", len(token))

    # 2. Connect WS
    ws_url = f"ws://localhost:8000/api/v1/aviator/ws?token={token}"
    print(f"Connecting to {ws_url}...")
    async with websockets.connect(ws_url) as ws:
        print("WS Connection OPEN!")
        # Receive first msg (sync)
        msg = await ws.recv()
        print("Received initial msg:", msg[:200])
        msg_obj = json.loads(msg)
        assert msg_obj.get("type") == "sync"
        print("Sync test PASSED! Phase:", msg_obj.get("phase"))

if __name__ == "__main__":
    asyncio.run(test())
