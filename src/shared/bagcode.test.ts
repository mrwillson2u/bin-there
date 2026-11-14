import { describe, expect, it } from "vitest";
import { bagPartNumber, bagText, parseBagCode } from "./bagcode";

const GS = "\u001d";
const RS = "\u001e";

describe("a shop bag's 2D barcode (DEC-074)", () => {
  it("reads a Digi-Key bag: its own number, the maker's, the quantity", () => {
    const code = `[)>${RS}06${GS}P296-6501-1-ND${GS}1PSN74HC595N${GS}30P296-6501-1-ND${GS}K${GS}1K71234567${GS}10K84512345${GS}11K1${GS}4LMX${GS}Q10${GS}11ZPICK${GS}12Z1234567${GS}13Z999999${GS}20Z0000000000${RS}\u0004`;
    const bag = parseBagCode(code)!;
    expect(bag).toEqual({ supplier: "Digi-Key", supplierPn: "296-6501-1-ND", mfrPn: "SN74HC595N", qty: 10 });
    expect(bagPartNumber(bag)).toBe("296-6501-1-ND");
    expect(bagText(bag)).toBe("Digi-Key 296-6501-1-ND (SN74HC595N)");
  });
  it("reads an older Digi-Key bag, whose own number is in P", () => {
    expect(parseBagCode(`[)>${RS}06${GS}P1528-1150-ND${GS}1P1578${GS}Q2`)).toEqual({ supplier: "Digi-Key", supplierPn: "1528-1150-ND", mfrPn: "1578", qty: 2 });
  });
  it("reads a bag that names only the maker's number (Mouser): no shop claimed", () => {
    const bag = parseBagCode(`>[)>06${GS}K12345678${GS}14K001${GS}1PLM2596S-ADJ/NOPB${GS}Q5${GS}11K0987654321${GS}4LMY${GS}1VTexas Instruments`)!;
    expect(bag).toEqual({ supplier: null, supplierPn: null, mfrPn: "LM2596S-ADJ/NOPB", qty: 5 });
    expect(bagPartNumber(bag)).toBe("LM2596S-ADJ/NOPB");
    expect(bagText(bag)).toBe("LM2596S-ADJ/NOPB");
  });
  it("reads the same code when the decoder shows control characters as pictures", () => {
    expect(parseBagCode("[)>␞06␝P1528-1150-ND␝1P1578␝30P1528-1150-ND␝K␝Q5␝11ZPICK␞␄")).toEqual({ supplier: "Digi-Key", supplierPn: "1528-1150-ND", mfrPn: "1578", qty: 5 });
  });
  it("reads an LCSC bag's QR code", () => {
    expect(parseBagCode("{pbn:PICK2009291337,on:SO2009291337,pc:C2040,pm:RP2040,qty:3,mc:,cc:1,pdi:34421807,hp:0,wc:ZH}")).toEqual({ supplier: "LCSC", supplierPn: "C2040", mfrPn: "RP2040", qty: 3 });
  });
  it("isn't fooled by other codes: a storage sticker, a web link, a labelled code with no part number", () => {
    expect(parseBagCode("BIN0042")).toBeNull();
    expect(parseBagCode("https://www.adafruit.com/product/1578")).toBeNull();
    expect(parseBagCode(`[)>${RS}06${GS}K123${GS}Q4`)).toBeNull();
    expect(parseBagCode(`[)>${RS}06${GS}1PABC${GS}Qlots`)!.qty).toBeNull();
  });
});
