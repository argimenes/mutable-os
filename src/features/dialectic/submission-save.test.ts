import {afterEach,expect,it,vi} from 'vitest';
import {conversationFilename,createSubmissionSave} from './submission-save';
afterEach(()=>vi.restoreAllMocks());
it('uses the requested local calendar filename',()=>{
 expect(conversationFilename(new Date(2026,10,10,14))).toBe('Conversation on November 10, 2026.ink');
});
it('serialises commit saves, coalesces queued commits and retains the submitted identity',async()=>{
 const finish:Array<(ok:boolean)=>void>=[],save=vi.fn((_id:string,_name:string)=>new Promise<boolean>(r=>finish.push(r)));
 const service=createSubmissionSave(save,()=>true);
 service.request('first');await Promise.resolve();
 service.request('first');service.request('first');service.request('second');
 expect(save.mock.calls.map(c=>c[0])).toEqual(['first']);expect(service.state('first')?.pending).toBe(true);
 finish.shift()!(true);await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
 expect(save.mock.calls[1][0]).toBe('first');finish.shift()!(true);
 await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(3));expect(save.mock.calls[2][0]).toBe('second');
 finish.shift()!(true);await vi.waitFor(()=>expect(service.state('second')?.pending).toBe(false));service.dispose();
});
it('retains a save error without retry storms, and supports an explicit retry',async()=>{
 const save=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(true),service=createSubmissionSave(save,()=>true);
 service.request('first');await vi.waitFor(()=>expect(service.state('first')?.error).toContain('Failed to fetch'));
 expect(save).toHaveBeenCalledTimes(1);service.request('first');await vi.waitFor(()=>expect(service.state('first')).toEqual({pending:false,error:''}));
 expect(save).toHaveBeenCalledTimes(2);service.dispose();
});
it('does no save work when disabled or disposed',async()=>{
 const save=vi.fn(),off=createSubmissionSave(save,()=>false),closed=createSubmissionSave(save,()=>true);
 off.request('first');closed.request('second');closed.dispose();await Promise.resolve();expect(save).not.toHaveBeenCalled();off.dispose();
});
