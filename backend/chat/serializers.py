from rest_framework import serializers

from .models import Conversacion, Mensaje


class MensajeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mensaje
        fields = ["id", "rol", "contenido", "citas", "sin_respuesta", "interrumpida", "creado"]
        read_only_fields = fields


class ConversacionResumenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversacion
        fields = ["id", "coleccion", "titulo", "creada", "actualizada"]
        read_only_fields = fields


class ConversacionSerializer(ConversacionResumenSerializer):
    mensajes = MensajeSerializer(many=True, read_only=True)

    class Meta(ConversacionResumenSerializer.Meta):
        fields = [*ConversacionResumenSerializer.Meta.fields, "mensajes"]
        read_only_fields = fields


class PreguntaSerializer(serializers.Serializer):
    pregunta = serializers.CharField(max_length=2000)
    conversacion = serializers.IntegerField(required=False, allow_null=True)

    def validate_pregunta(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("Escribe una pregunta.")
        return valor
