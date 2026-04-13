package com.ozonware.dto

data class OzonCsvColumnMapping(
    val status: String = "Статус",
    val transferAt: String = "Фактическая дата передачи в доставку",
    val quantity: String = "Количество",
    val postingNumber: String = "Номер отправления",
    val offerId: String = "Артикул",
    val ozonSku: String = "SKU",
    val acceptedAt: String = "Принят в обработку",
    val orderNumber: String = "Номер заказа",
    val shipmentDate: String = "Дата отгрузки",
    val shipmentDeadline: String = "Дата отгрузки без просрочки",
    val deliveryDate: String = "Дата доставки",
    val cancellationDate: String = "Дата отмены",
    val productName: String = "Название товара",
    val yourPrice: String = "Ваша цена",
    val paidByCustomer: String = "Оплачено покупателем",
    val shipmentAmount: String = "Сумма отправления",
    val currencyPrimary: String = "Код валюты отправления",
    val currencyFallback: String = "Код валюты товара",
    val discountPercent: String = "Скидка %",
    val discountRub: String = "Скидка руб",
    val shippingCost: String = "Стоимость доставки",
    val promotions: String = "Акции",
    val volumetricWeightKg: String = "Объемный вес товаров, кг"
)
