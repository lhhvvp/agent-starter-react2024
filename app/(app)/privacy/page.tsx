import Link from 'next/link';
import { headers } from 'next/headers';
import { getAppConfig } from '@/lib/utils';

export default async function PrivacyPage() {
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

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">隐私声明</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        本页面用于说明「医保智能 AI 客服」在使用过程中的数据处理方式与用户注意事项。我们建议在开始咨询前阅读。
      </p>

      <div className="mt-6 space-y-5 text-sm leading-7">
        <section className="space-y-2">
          <h2 className="text-base font-semibold">1. 不建议提供的敏感信息</h2>
          <p className="text-muted-foreground">
            为保护个人信息安全，请尽量避免在对话中输入身份证号、银行卡号、精确住址、手机号、个人病历等敏感信息。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">2. 记录与留存</h2>
          <p className="text-muted-foreground">
            系统可能会对对话内容进行必要的记录，用于改进服务质量、排查问题与安全审计。我们会尽量减少收集、缩短留存、限制访问。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">3. AI 建议的边界</h2>
          <p className="text-muted-foreground">
            AI 回复仅作参考，不构成医疗诊断或最终办事结论。如涉及紧急情况，请立即拨打 120/110；如需正式结论，请以主管部门发布或窗口答复为准。
          </p>
        </section>
      </div>
    </div>
  );
}

