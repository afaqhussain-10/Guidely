"""Generates simple PNG icons for the Guidely extension (no dependencies)."""
import zlib, struct, os

def make_png(size, r, g, b):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))

    raw = b''
    for y in range(size):
        raw += b'\x00'
        for x in range(size):
            # Rounded square: draw indigo background with white checkmark shape
            cx, cy = size / 2, size / 2
            radius = size * 0.42
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy) ** 0.5
            if dist <= radius:
                # Inside circle: indigo
                raw += bytes([r, g, b])
            else:
                # Outside: transparent-ish (white bg for PNG)
                raw += bytes([240, 240, 255])

    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

os.makedirs('icons', exist_ok=True)
for size in [16, 32, 48, 128]:
    data = make_png(size, 99, 102, 241)  # Indigo #6366f1
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(data)
    print(f'Created icons/icon{size}.png')

print('Done!')
