package com.smartwallet.app.accessibility;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import org.junit.Test;

public class PaymentPageDetectorTest {

    @Test
    public void detectsWechatSuccessPageWithSplitAmount() {
        assertTrue(PaymentPageDetector.isPaymentSuccessPage(Arrays.asList("支付成功", "瑞幸咖啡", "¥", "18.60", "完成")));
    }

    @Test
    public void detectsAlipaySuccessPageWithCurrencyAmount() {
        assertTrue(PaymentPageDetector.isPaymentSuccessPage(Arrays.asList("支付成功", "￥1,299.00", "某某超市", "完 成")));
    }

    @Test
    public void rejectsPageWithoutDoneAction() {
        assertFalse(PaymentPageDetector.isPaymentSuccessPage(Arrays.asList("支付成功", "¥18.60")));
    }

    @Test
    public void rejectsPageWithoutAmount() {
        assertFalse(PaymentPageDetector.isPaymentSuccessPage(Arrays.asList("支付成功", "完成")));
    }

    @Test
    public void rejectsBillDetailPage() {
        assertFalse(
            PaymentPageDetector.isPaymentSuccessPage(Arrays.asList("账单详情", "-18.60", "当前状态", "支付成功", "交易单号", "完成"))
        );
    }

    @Test
    public void rejectsChatMessageMentioningSuccess() {
        assertFalse(PaymentPageDetector.isPaymentSuccessPage(Arrays.asList("微信支付：你已在瑞幸咖啡支付成功，金额¥18.60", "完成")));
    }

    @Test
    public void detectsAmountForRememberedPages() {
        assertTrue(PaymentPageDetector.hasAmount(Arrays.asList("订单详情", "实付", "¥32.5")));
        assertTrue(PaymentPageDetector.hasAmount(Arrays.asList("-128.00")));
        assertFalse(PaymentPageDetector.hasAmount(Arrays.asList("订单详情", "共 3 件")));
    }

    @Test
    public void fingerprintTracksContent() {
        String first = PaymentPageDetector.fingerprint("com.tencent.mm", Arrays.asList("支付成功", "¥18.60", "完成"));
        assertEquals(first, PaymentPageDetector.fingerprint("com.tencent.mm", Arrays.asList("支付 成功", "¥18.60", "完成")));
        assertNotEquals(first, PaymentPageDetector.fingerprint("com.tencent.mm", Arrays.asList("支付成功", "¥20.00", "完成")));
    }
}
