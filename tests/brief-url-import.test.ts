import assert from "node:assert/strict";
import test from "node:test";
import { isPublicNetworkAddress } from "../src/lib/brief-url-import";

test("blocks private, loopback, link-local, and documentation addresses", () => {
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.2.1",
    "198.51.100.2",
    "203.0.113.2",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::192.168.1.1",
    "64:ff9b::808:808",
  ]) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }
});

test("accepts public IPv4 and IPv6 addresses", () => {
  assert.equal(isPublicNetworkAddress("8.8.8.8"), true);
  assert.equal(isPublicNetworkAddress("1.1.1.1"), true);
  assert.equal(isPublicNetworkAddress("2606:4700:4700::1111"), true);
});
