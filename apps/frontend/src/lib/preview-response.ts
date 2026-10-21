// Keep frontend-first rolling deployments compatible with older JSON/PNG APIs.
export async function decodePreviewResponse(res: Response): Promise<{ image: Blob; vars?: Record<string, string> }> {
    if (res.headers.get('Content-Type')?.includes('application/json')) {
        const data = (await res.json()) as { image: string; vars?: Record<string, string> };
        const match = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data.image);
        if (!match) throw new Error('Invalid preview image');
        const bytes = Uint8Array.from(atob(match[2]!), (char) => char.charCodeAt(0));
        return { image: new Blob([bytes], { type: match[1] }), vars: data.vars };
    }
    const image = await res.blob();
    if (!['image/png', 'image/webp'].includes(image.type)) throw new Error('Invalid preview image');
    const vars = res.headers.get('X-Preview-Vars');
    return { image, vars: vars ? (JSON.parse(decodeURIComponent(vars)) as Record<string, string>) : undefined };
}
