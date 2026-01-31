import Link from 'next/link';
import { headers } from 'next/headers';
import { getAppConfig } from '@/lib/utils';

export default async function TermsPage() {
  const hdrs = await headers();
  const { companyName, logo, logoDark } = await getAppConfig(hdrs);

  return (
    <div className="mx-auto min-h-svh max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm underline underline-offset-4">
          返回
        </Link>
        <div className="flex items-center gap-2">
          <img src={logo} alt={`${companyName} Logo`} className="block h-7 w-auto dark:hidden" />
          <img
            src={logoDark ?? logo}
            alt={`${companyName} Logo`}
            className="hidden h-7 w-auto dark:block"
          />
        </div>
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">服务条款</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        使用本服务即表示你理解并同意以下条款。本条款用于 MVP 阶段的基础约束，后续可按合规要求完善。
      </p>

      <div className="mt-6 space-y-5 text-sm leading-7">
        <section className="space-y-2">
          <h2 className="text-base font-semibold">1. 服务性质</h2>
          <p className="text-muted-foreground">
            本服务提供医保政策与办事流程的智能问答辅助，可能存在不准确或过期信息。请以官方发布信息为准。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">2. 禁止行为</h2>
          <p className="text-muted-foreground">
            请勿利用本服务进行违法违规、攻击测试、刷量、传播不当内容，或提交包含他人隐私的内容。我们有权对异常流量进行限制或阻断。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">3. 免责声明</h2>
          <p className="text-muted-foreground">
            对因使用本服务产生的任何间接损失，我们不承担责任。若遇到紧急情况，请立即拨打 120/110。
          </p>
        </section>
      </div>
    </div>
  );
}

