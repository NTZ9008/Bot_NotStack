import { useEffect, useState } from 'react';

// Query caches own Blobs; mounted views alone own URLs, including StrictMode cleanup.
export function useObjectUrl(blob: Blob | undefined): string | undefined {
    const [image, setImage] = useState<{ blob: Blob; url: string }>();
    useEffect(() => {
        if (!blob) {
            setImage(undefined);
            return;
        }
        const url = URL.createObjectURL(blob);
        setImage({ blob, url });
        return () => URL.revokeObjectURL(url);
    }, [blob]);
    return image?.blob === blob ? image?.url : undefined;
}
