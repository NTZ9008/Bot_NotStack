import type { MeResponse } from '@notstack/shared';
import type { Query, QueryClient, QueryKey } from '@tanstack/react-query';
import { sessionRequests } from './session-state';

// ข้อมูลสาธารณะที่ไม่ผูกกับบัญชี — เก็บไว้ตอนเปลี่ยน session
// (ถ้าล้างตอนหน้า login กำลังโหลดช่องทาง login อยู่ ปุ่ม Discord จะหายไปจนกว่าจะรีเฟรชหน้า)
export const PUBLIC_QUERY_KEYS: readonly QueryKey[] = [
    ['auth', 'providers'],
    ['app', 'info'],
];

const isPrivateQuery = (query: Query): boolean => !PUBLIC_QUERY_KEYS.some((key) => key.every((part, i) => query.queryKey[i] === part));

export function replaceSession(queryClient: QueryClient, me: MeResponse | null): void {
    sessionRequests.reset();
    void queryClient.cancelQueries({ predicate: isPrivateQuery });
    queryClient.removeQueries({ predicate: isPrivateQuery });
    queryClient.getMutationCache().clear();
    queryClient.setQueryData(['auth', 'me'], me);
}
