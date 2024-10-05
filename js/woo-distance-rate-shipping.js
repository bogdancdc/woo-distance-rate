
const getPolygons = async () => {
    const response = await fetch('/wp-content/plugins/woo-distance-rate-shipping/js/mkad.json?v=2');
    const polygons = await response.json();
    return polygons;
}

const getGeocode = async (address) => {
    let geocode = null;

    const helperTextError = document.getElementById("helperTextError");
    // "#shipping_method_0_flat_rate-1" checked true and remove disabled
    jQuery("#shipping_method_0_flat_rate-1").prop('checked', true);
    jQuery("#shipping_method_0_flat_rate-1").attr('disabled', false);


    if (helperTextError) {
        helperTextError.style.display = 'none';
    }

    await ymaps.geocode(address, {
        /**
         * Опции запроса
         * @see https://api.yandex.ru/maps/doc/jsapi/2.1/ref/reference/geocode.xml
         */
        results: 1
    }).then(function (res) {
        geocode = res;
    }).catch((e) => {
        return e;
        console.log(e)
    })
    return geocode;
}

const brew = async (theMap) => {


    // disable calculate_delivery_cost_button button to prevent multiple submissions
    jQuery('#calculate_delivery_cost_button').attr('disabled', true);
    
    if (jQuery("#billing_address_1").val() === '') {
        return;
    } else {
        // clear the map of all objects and routes

        const mkadDistance = distanceRateShippingData.mkadDistance ? parseInt(distanceRateShippingData.mkadDistance) : 0;
        const customShippingCost = distanceRateShippingData.customShippingCost ? parseInt(distanceRateShippingData.customShippingCost) : 0;
        const mkadDistanceCost = distanceRateShippingData.mkadDistanceCost ? parseInt(distanceRateShippingData.mkadDistanceCost) : 0;
        const longDistanceNotification = distanceRateShippingData.longDistanceNotification ? distanceRateShippingData.longDistanceNotification : '';

        theMap.geoObjects.removeAll();

        let gotGeocode = null;

        await getGeocode(document.getElementById('billing_address_1').value).then((res) => {
            if (res === null) {
                return;
            } else {
                gotGeocode = res;
            }
        }).catch((e) => {
            console.log(e)
        })

        if (gotGeocode === null) {
            return;
        }
        
        const polygons = await getPolygons();
        const moscowPolygon = new ymaps.Polygon(polygons.coordinates);
        theMap.geoObjects.add(moscowPolygon);

        const coordinates = gotGeocode.geoObjects.get(0).geometry.getCoordinates();

        // check if coordinates in [54,39],[56,35]
        if (parseInt(coordinates[0]) < 54 || parseInt(coordinates[0]) > 56 || parseInt(coordinates[1]) < 35 || parseInt(coordinates[1]) > 39) {
            let errMessage = document.createElement('div');
            errMessage.setAttribute('id', 'helperTextError');
            errMessage.innerHTML = longDistanceNotification;
            errMessage.style.fontSize = '14px';
            errMessage.style.marginTop = '4px';

            document.getElementById('billing_address_1').insertAdjacentElement('afterend', errMessage);
            jQuery("#shipping_method_0_flat_rate-1").prop('checked', false);
            jQuery("#shipping_method_0_flat_rate-1").attr('disabled', true);

            // отправляем AJAX запрос на сервер для обновления стоимости доставки
            jQuery.ajax({
                url: wc_checkout_params.ajax_url,
                type: 'POST',
                data: {
                    action: 'set_shipping_price',
                    security: wc_checkout_params.update_order_review_nonce,
                    cost: customShippingCost,
                },
                success: function( response ) {
                    // обновляем данные доставки на странице
                    jQuery('body').trigger('update_checkout');
                    jQuery('#calculate_delivery_cost_button').removeAttr('disabled');
                },
                error: function( error ) {
                    jQuery('#calculate_delivery_cost_button').removeAttr('disabled');
                    console.log( error );
                }
            });


            return;
        } else {
            ymaps.route([[55.769636, 37.505472], coordinates ]).then(
                async (res) => {
                    // Объединим в выборку все сегменты маршрута.
                    var pathsObjects = ymaps.geoQuery(res.getPaths()),
                        edges = [];
                        
                    // Переберем все сегменты и разобьем их на отрезки.
                    pathsObjects.each(function (path) {
                        var coordinates = path.geometry.getCoordinates();
                        for (var i = 1, l = coordinates.length; i < l; i++) {
                            edges.push({
                                type: 'LineString',
                                coordinates: [coordinates[i], coordinates[i - 1]]
                            });
                        }
                    });
                    
                    // Создадим новую выборку, содержащую:
                    // - отрезки, описываюшие маршрут;
                    // - начальную и конечную точки;
                    // - промежуточные точки.
                    var routeObjects = ymaps.geoQuery(edges)
                            .add(res.getWayPoints())
                            .add(res.getViaPoints())
                            .setOptions('strokeWidth', 3)
                            .addToMap(theMap),
                        // Найдем все объекты, попадающие внутрь МКАД.
                        objectsInMoscow = routeObjects.searchInside(moscowPolygon),
                        // Найдем объекты, пересекающие МКАД.
                        boundaryObjects = routeObjects.searchIntersect(moscowPolygon);
                    // Раскрасим в разные цвета объекты внутри, снаружи и пересекающие МКАД.
                    boundaryObjects.setOptions({
                        strokeColor: '#06ff00',
                        preset: 'islands#greenIcon'
                    });
                    objectsInMoscow.setOptions({
                        strokeColor: '#ff0005',
                        preset: 'islands#redIcon'
                    });
                    // Объекты за пределами МКАД получим исключением полученных выборок из исходной.
                    routeObjects.remove(objectsInMoscow).remove(boundaryObjects).setOptions({
                        strokeColor: '#0010ff',
                        preset: 'islands#blueIcon'
                    });

                    const outsideObjects = routeObjects.remove(objectsInMoscow).remove(boundaryObjects);
                    
                    let distance = 0;
                    let price = customShippingCost;

                    if (outsideObjects.get(0) !== undefined) {
                        //calculate the distance of the path outside of objectsInMoscow
                        var startCoords = outsideObjects.get(0).geometry.getCoordinates();
                        var finishCoords = outsideObjects.get(outsideObjects.getLength() - 1).geometry.getCoordinates();

                        await ymaps.route([startCoords[0], finishCoords]).then((res) => {
                            distance = res.getLength() / 1000;
                            distance = parseInt(distance.toFixed(0))
                        }).catch((e) => {
                            console.log(e)
                        })
                    }
                    if (distance > mkadDistance) {

                        price = customShippingCost + (mkadDistanceCost * (distance - mkadDistance));

                        price = parseInt(price.toFixed(0));

                        // отправляем AJAX запрос на сервер для обновления стоимости доставки
                        jQuery.ajax({
                            url: wc_checkout_params.ajax_url,
                            type: 'POST',
                            data: {
                                action: 'set_shipping_price',
                                security: wc_checkout_params.update_order_review_nonce,
                                cost: price,
                                distance: distance,
                            },
                            success: function( response ) {
                                // обновляем данные доставки на странице
                                jQuery('body').trigger('update_checkout');
                                jQuery('#calculate_delivery_cost_button').removeAttr('disabled');
                            },
                            error: function( error ) {
                                jQuery('#calculate_delivery_cost_button').removeAttr('disabled');
                                console.log( error );
                            }
                        });
                    } else {
                        // отправляем AJAX запрос на сервер
                        jQuery.ajax({
                            url: wc_checkout_params.ajax_url,
                            type: 'POST',
                            data: {
                                action: 'set_shipping_price',
                                security: wc_checkout_params.update_order_review_nonce,
                                cost: price,
                            },
                            success: function( response ) {
                                // обновляем данные доставки на странице
                                jQuery('body').trigger('update_checkout');
                                jQuery('#calculate_delivery_cost_button').removeAttr('disabled');
                            },
                            error: function( error ) {
                                jQuery('#calculate_delivery_cost_button').removeAttr('disabled');
                                console.log( error );
                            }
                        });
                    }
                    
                }
            ).catch((error) => {
                jQuery('#calculate_delivery_cost_button').removeAttr('disabled');
                console.log(error);
            });
        }
    }
}

const ready = async () => {

    const pickupCheck = document.querySelector('#shipping_method_0_local_pickup-4');
    const addressInput = document.querySelector('#billing_address_1');

    pickupCheck.addEventListener('change', (e) => {
        console.log('checked', e.target.checked);
    })

    await ymaps.ready();
    const theMap = new ymaps.Map("map", {
        center: [55.769636, 37.505472],
        zoom: 9
    }, {
        searchControlProvider: 'yandex#search'
    });
    brew(theMap)
    document.getElementById('calculate_delivery_cost_button').addEventListener('click', () => {
        brew(theMap)
    });
    document.getElementById('billing_address_1').addEventListener('blur', () => {
        brew(theMap)
    })
    var suggestView1 = new ymaps.SuggestView('billing_address_1', {
        results: 3,
        boundedBy: [[54,39],[56,35]]
    });

    const woo_messages = document.querySelectorAll('.woocommerce-message');

    // костыль
    if (woo_messages.length > 0) {
        woo_messages.forEach((message) => {
            if (message.innerText.includes('Клиент соответствует зоне')) {
                message.style.display = 'none';
            }
        })
    }

}

document.addEventListener('DOMContentLoaded', ready);