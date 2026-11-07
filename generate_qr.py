"""
generate_qr.py - High-contrast QR code generator with solid white background
designed for black PVC cards.
"""
import argparse
import qrcode
from PIL import Image

def generate_qr(target_url: str, output_path: str = "card_qr.png"):
    print(f"Generating QR code for: {target_url}")
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=15,
        border=4,
    )
    qr.add_data(target_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output_path)
    print(f"Saved print-ready QR code to: {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate print-ready QR for NFC card fallback")
    parser.add_argument(
        "--url",
        default="https://grandmasylar.github.io/nevada/?src=qr",
        help="Destination URL",
    )
    parser.add_argument(
        "--output",
        default="card_qr.png",
        help="Output image filename",
    )
    args = parser.parse_args()
    generate_qr(args.url, args.output)

