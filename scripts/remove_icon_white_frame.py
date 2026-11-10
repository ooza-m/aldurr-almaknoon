from pathlib import Path
from PIL import Image
import numpy as np
from scipy import ndimage as ndi

for theme in ("rose", "navy", "olive", "plum"):
    for size in (192, 512, 1024):
        path = Path(f"icons/app-{theme}-{size}.png")
        if not path.is_file():
            raise SystemExit(f"Missing original artwork: {path}")
        im = Image.open(path).convert("RGB")
        src = np.asarray(im, dtype=np.uint8)
        if src.shape != (size, size, 3):
            raise SystemExit(f"Unexpected icon dimensions: {path} {src.shape}")
        maximum = src.max(axis=2).astype(np.int16)
        minimum = src.min(axis=2).astype(np.int16)
        near_white = (minimum > 205) & ((maximum - minimum) < 42)
        labels, _ = ndi.label(near_white)
        corner_labels = [labels[0, 0], labels[0, -1], labels[-1, 0], labels[-1, -1]]
        external = np.isin(labels, [v for v in corner_labels if v])
        external = ndi.binary_dilation(external, iterations=max(2, round(size/256)))
        # Sample the actual icon's background inwards; never recolour the book or flower.
        invalid_sources = external | ((maximum - minimum) < 35)
        nearest = ndi.distance_transform_edt(invalid_sources, return_distances=False, return_indices=True)
        out = src.copy()
        out[external] = src[tuple(axis[external] for axis in nearest)]
        Image.fromarray(out, "RGB").save(path, optimize=True)
        print(f"Processed {path}: {external.sum()} white-frame pixels removed")
