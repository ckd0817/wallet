package com.smartwallet.app.accessibility;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 根据无障碍节点文字判断当前页面是否为支付完成页。
 * 判定条件：成功标题 + 完成按钮 + 金额同时出现，且不含账单详情、密码输入等页面特征。
 */
public final class PaymentPageDetector {

    static final List<String> SUCCESS_TITLES = Collections.unmodifiableList(Arrays.asList("支付成功", "付款成功", "转账成功"));
    static final List<String> DONE_ACTIONS = Collections.unmodifiableList(Arrays.asList("完成", "返回商家"));
    private static final List<String> EXCLUDED_MARKERS = Arrays.asList(
        "账单详情",
        "当前状态",
        "交易单号",
        "商户单号",
        "支付密码",
        "请输入密码"
    );
    private static final int SUCCESS_TITLE_MAX_LENGTH = 20;
    private static final Pattern CURRENCY_AMOUNT = Pattern.compile("[¥￥]-?\\d[\\d,]*(\\.\\d{1,2})?");
    private static final Pattern PLAIN_AMOUNT = Pattern.compile("^-?\\d[\\d,]*\\.\\d{2}$");

    private PaymentPageDetector() {}

    public static boolean isSuccessTitle(String text) {
        String value = normalize(text);
        if (value.isEmpty() || value.length() > SUCCESS_TITLE_MAX_LENGTH) {
            return false;
        }
        for (String title : SUCCESS_TITLES) {
            if (value.startsWith(title)) {
                return true;
            }
        }
        return false;
    }

    public static boolean isDoneAction(String text) {
        return DONE_ACTIONS.contains(normalize(text));
    }

    public static boolean isAmount(String text) {
        String value = normalize(text);
        return CURRENCY_AMOUNT.matcher(value).find() || PLAIN_AMOUNT.matcher(value).matches();
    }

    public static boolean hasAmount(List<String> texts) {
        if (texts == null) {
            return false;
        }
        for (String text : texts) {
            if (isAmount(text)) {
                return true;
            }
        }
        return false;
    }

    public static boolean isPaymentSuccessPage(List<String> texts) {
        if (texts == null || texts.isEmpty()) {
            return false;
        }

        boolean hasTitle = false;
        boolean hasDoneAction = false;
        boolean hasAmount = false;
        for (String text : texts) {
            String value = normalize(text);
            if (value.isEmpty()) {
                continue;
            }
            for (String marker : EXCLUDED_MARKERS) {
                if (value.contains(marker)) {
                    return false;
                }
            }
            hasTitle = hasTitle || isSuccessTitle(value);
            hasDoneAction = hasDoneAction || isDoneAction(value);
            hasAmount = hasAmount || isAmount(value);
        }
        return hasTitle && hasDoneAction && hasAmount;
    }

    /** 页面内容指纹：保留金额等可变内容，用于识别同一笔支付的重复事件。 */
    public static String fingerprint(String packageName, List<String> texts) {
        List<String> values = new ArrayList<>();
        if (texts != null) {
            for (String text : texts) {
                String value = normalize(text);
                if (!value.isEmpty()) {
                    values.add(value);
                }
            }
        }
        return (packageName == null ? "" : packageName) + "|" + Integer.toHexString(String.join("\n", values).hashCode());
    }

    static String normalize(String text) {
        return text == null ? "" : text.replaceAll("\\s+", "");
    }
}
